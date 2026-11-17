// Read-only original-file capture. Never changes Storage or Drive files.
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function driveIds(sql) {
  const ids=new Set();
  for(const raw of sql.match(/https:\/\/drive\.google\.com\/[^\s"'<>\\]+/g)||[]) {
    const u=new URL(raw),id=u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');
    if(/^[\w-]{10,200}$/.test(id||''))ids.add(id);
  }
  return [...ids].sort();
}

export async function captureAssets({staging,config,inventory,ids,maxBytes}) {
  const folder=join(staging,'assets');await mkdir(folder);
  const objects=inventory.objects||[];
  const known=objects.reduce((n,o)=>n+Number(o.metadata?.size||0),0);
  if(!Number.isFinite(known)||known>maxBytes)throw new Error('EXPORT_ASSET_BUDGET');
  let used=0;const files=[];
  async function download(response,name,expectedBytes) {
    if(!response.ok||!response.body) {await response.body?.cancel();throw new Error('EXPORT_ASSET_HTTP');}
    const declared=Number(response.headers.get('content-length'));
    if(Number.isFinite(declared)&&declared>maxBytes-used) {await response.body.cancel();throw new Error('EXPORT_ASSET_BUDGET');}
    const sha=createHash('sha256');let bytes=0;
    const meter=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;used+=chunk.length;if(used>maxBytes)return done(new Error('EXPORT_ASSET_BUDGET'));sha.update(chunk);done(null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(join(folder,name),{flags:'wx',mode:0o600}));
    if(!bytes||(expectedBytes!=null&&bytes!==Number(expectedBytes)))throw new Error('EXPORT_ASSET_SIZE');
    return {file:'assets/'+name,bytes,sha256:sha.digest('hex'),mimeType:response.headers.get('content-type')};
  }
  for(const o of objects) {
    if(!/^[\da-f-]{36}$/i.test(o.id))throw new Error('EXPORT_ASSET_ID');
    const url=new URL('/storage/v1/object/'+encodeURIComponent(o.bucket_id)+'/'+o.name.split('/').map(encodeURIComponent).join('/'),config.SUPABASE_URL);
    const response=await fetch(url,{headers:{apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY},redirect:'error',signal:AbortSignal.timeout(180000)});
    files.push({sourceKey:'storage/'+o.bucket_id+'/'+o.name,bucket:o.bucket_id,path:o.name,objectId:o.id,revision:o.updated_at,...await download(response,o.id+'.bin',o.metadata?.size)});
    if(files.length%20===0)console.log('Original assets saved:',files.length);
  }
  for(const id of ids) {
    let url=new URL('https://drive.google.com/uc?export=download&id='+encodeURIComponent(id)),response;
    for(let redirects=0;redirects<=5;redirects++) {
      // Never forward Supabase credentials to Google or to any redirect.
      response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(180000)});
      if(![301,302,303,307,308].includes(response.status))break;
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location||redirects===5)throw new Error('EXPORT_DRIVE_REDIRECT');
      const next=new URL(location,url);
      if(next.protocol!=='https:'||next.username||next.password||!['google.com','googleusercontent.com'].some(d=>next.hostname===d||next.hostname.endsWith('.'+d)))throw new Error('EXPORT_DRIVE_REDIRECT');
      url=next;
    }
    if(!/^image\//i.test(response.headers.get('content-type')||'')) {await response.body?.cancel();throw new Error('EXPORT_DRIVE_NOT_IMAGE');}
    files.push({sourceKey:'drive/'+id,driveFileId:id,...await download(response,'drive-'+id+'.bin')});
  }
  // Hash every file again from disk, independently of the download stream.
  for(const f of files) {
    const data=await readFile(join(staging,f.file));
    if(data.length!==f.bytes||createHash('sha256').update(data).digest('hex')!==f.sha256)throw new Error('EXPORT_ASSET_CHECKSUM');
  }
  return {format:'gm-note-portable-assets-v1',capturedAt:new Date().toISOString(),buckets:inventory.buckets,files,storageCount:objects.length,driveCount:ids.length,bytes:used,verified:true};
}
