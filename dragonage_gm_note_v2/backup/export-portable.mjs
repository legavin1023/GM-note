// Read-only export. No restore or production database writes are performed.
import { readFile, writeFile, mkdir, mkdtemp, copyFile, lstat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, sep } from 'node:path';
import { getCACertificates } from 'node:tls';
import { encrypt, decrypt } from './crypto.mjs';
import { captureAssets, driveIds } from './portable-assets.mjs';

const root=resolve('.');
const pgBin=process.env.PORTABLE_PG_BIN||'C:/Program Files/PostgreSQL/18/bin';
const tool=name=>join(pgBin,process.platform==='win32'?name+'.exe':name);
async function sha(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
function run(command,args,env=process.env,capture=false){
  return new Promise((ok,fail)=>{
    const child=spawn(command,args,{env,stdio:['ignore',capture?'pipe':'ignore','pipe'],windowsHide:true});let diagnostic='',output='',overflow=false;
    if(capture)child.stdout.on('data',b=>{if(output.length+b.length>64*1024*1024){overflow=true;child.kill();}else output+=b.toString();});
    child.stderr.on('data',b=>{if(diagnostic.length<16384)diagnostic+=b.toString();});
    child.on('error',()=>fail(new Error('EXPORT_TOOL_UNAVAILABLE')));
    child.on('exit',code=>{
      if(overflow)return fail(new Error('EXPORT_CAPTURE_LIMIT'));
      if(!code)return ok(output);
      // Never print libpq errors: they may include connection/account details.
      const category=/certificate|SSL|TLS/i.test(diagnostic)?'TLS':/permission denied|must be|insufficient privilege/i.test(diagnostic)?'PERMISSION':/timeout|could not connect|could not translate|connection.*failed|refused/i.test(diagnostic)?'CONNECTION':'TOOL';
      const error=new Error('EXPORT_'+category+'_FAILED');
      if(category==='TLS')error.safeDetails={untrustedChain:/certificate verify failed|self.signed|unable to get.*issuer/i.test(diagnostic),hostnameMismatch:/does not match host name|hostname mismatch/i.test(diagnostic),rootFileProblem:/root certificate file|could not read.*certificate|no certificate.*found/i.test(diagnostic),tlsRejected:/SSL.*closed|SSL.*error|TLS.*alert/i.test(diagnostic)};
      fail(error);
    });
  });
}
let staging;
try {
  const config=JSON.parse(await readFile('.backup.local.env','utf8'));
  const connection=new URL(config.BACKUP_DATABASE_URL);
  if(!config.BACKUP_ENCRYPTION_KEY)throw new Error('EXPORT_KEY_MISSING');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const output=resolve('backup-output','migration-'+stamp);
  await mkdir(output,{recursive:true});
  staging=await mkdtemp(join(tmpdir(),'gm-note-portable-'));
  const certFile=join(staging,'trusted-roots.pem');
  const trusted=[...getCACertificates('default')];
  const projectCA=process.env.PORTABLE_DB_CA_FILE||join(root,'prod-ca-2021.crt');
  try {
    const pem=await readFile(projectCA,'utf8'),certificate=new X509Certificate(pem);
    if(!certificate.ca||new Date(certificate.validTo).getTime()<=Date.now())throw new Error('EXPORT_CA_INVALID');
    trusted.push(pem);
  }catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(certFile,trusted.join('\n'),{mode:0o600});
  const env={...process.env,PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGDATABASE:decodeURIComponent(connection.pathname.slice(1)),PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),PGCONNECT_TIMEOUT:'15',PGSSLMODE:'verify-full',PGSSLROOTCERT:certFile};
  const database=join(staging,'database.dump');
  const withAssets=process.argv.includes('--with-assets');
  const storageInventory=async()=>JSON.parse(await run(tool('psql'),['--no-password','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',"SELECT json_build_object('buckets',(SELECT coalesce(json_agg(b ORDER BY id),'[]') FROM storage.buckets b),'objects',(SELECT coalesce(json_agg(o ORDER BY id),'[]') FROM storage.objects o))"],{...env,PGOPTIONS:'-c default_transaction_read_only=on'},true));
  const inventory=withAssets?await storageInventory():null;
  console.log('Exporting consistent full PostgreSQL dump (read-only)…');
  await run(tool('pg_dump'),['--no-password','--format=custom','--quote-all-identifiers','--file='+database],env);
  // Extract schema from the SAME dump, avoiding inconsistent separate snapshots.
  await run(tool('pg_restore'),['--schema-only','--file='+join(staging,'schema.sql'),database]);
  await run(tool('pg_restore'),['--list','--file='+join(staging,'database-contents.txt'),database]);
  await run(tool('pg_dumpall'),['--no-password','--roles-only','--no-role-passwords','--file='+join(staging,'roles.sql')],env);
  let assets=null;
  if(withAssets){
    const dataFile=join(staging,'database-data.sql');
    await run(tool('pg_restore'),['--data-only','--file='+dataFile,database]);
    const ids=driveIds(await readFile(dataFile,'utf8'));
    const maxBytes=Number(process.env.PORTABLE_MAX_ASSET_BYTES||200*1024*1024);
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('EXPORT_ASSET_BUDGET');
    console.log('Capturing originals: Storage',inventory.objects.length,'; Drive',ids.length,'; Storage bytes',inventory.objects.reduce((n,o)=>n+Number(o.metadata?.size||0),0));
    assets=await captureAssets({staging,config,inventory,ids,maxBytes});
    if(JSON.stringify(inventory)!==JSON.stringify(await storageInventory()))throw new Error('EXPORT_STORAGE_CHANGED');
    await writeFile(join(staging,'asset-manifest.json'),JSON.stringify(assets,null,2),{mode:0o600});
  }
  const sourceRoot=join(staging,'source');await mkdir(sourceRoot);
  const listed=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','.'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);
  const files=[];
  for(const name of [...new Set(listed)].sort()) {
    const path=resolve(root,name);
    if(!path.startsWith(root+sep))throw new Error('EXPORT_SOURCE_PATH');
    const segments=name.replaceAll('\\','/').split('/'),base=segments.at(-1);
    if(segments.some(s=>['node_modules','.git','.temp','.staging','output','dist','backup-output','.backup-tools'].includes(s))||(/(^\.env(?:\.|$)|\.local\.env$|\.enc$|\.dump$|\.pem$)/i.test(base)&&base!=='.env.example'))continue;
    const info=await lstat(path).catch(()=>null);if(!info?.isFile()||info.isSymbolicLink())continue;
    const destination=join(sourceRoot,name);await mkdir(dirname(destination),{recursive:true});await copyFile(path,destination);
    files.push({path:name,sha256:await sha(destination),bytes:info.size});
  }
  // These settings are encrypted INSIDE the package. The decryption key must
  // still be kept independently; local settings may differ from the live UI.
  const recovery={capturedAt:new Date().toISOString(),liveDashboardSecretsVerified:false,settings:{}};
  for(const name of ['.backup.local.env','.google-backup.local.env','.env','.env.local','supabase/functions/.env']) {
    try {recovery.settings[name]=await readFile(name,'utf8');} catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await writeFile(join(staging,'recovery-settings.json'),JSON.stringify(recovery,null,2),{mode:0o600});
  const instructions=`# GM-note 이관용 보관본\n\n- database.dump: 동일 스냅샷의 DB 구조와 데이터 전체.\n- schema.sql: 위 덤프에서 추출한 테이블/관계/인덱스/뷰/함수/트리거/RLS/권한 구조.\n- roles.sql: DB 역할과 멤버십. 역할 비밀번호 제외.\n- source/: 내보낸 시점의 소스(미커밋 변경 포함). 실제 env 파일은 제외.\n- recovery-settings.json: 로컬 복구 설정. 운영 Dashboard Secrets와 일치 여부는 미검증.\n- manifest.json: 파일 SHA-256과 소스 목록.\n\n이 파일만으로 Storage/Drive의 바이너리 원본까지 포함되지는 않습니다. 진행 중인 Google assets/records 백업을 함께 보관하세요. 암호화 키는 이 보관본과 별도 안전한 곳에 보관하세요.\n\n복원은 먼저 별도 PostgreSQL/Supabase 테스트 환경에서 수행하세요. pg_restore --list database.dump로 확인하고, 원본 PostgreSQL 버전 및 확장/역할을 준비한 뒤 복구 대상을 선택하세요. 운영 DB에 --clean을 자동 실행하지 않습니다. 일반 PostgreSQL로 이동하면 auth.uid()와 역할/RLS에 의존한 부분, Supabase Auth/API/Edge/Realtime 및 배포 설정을 대체하거나 이식해야 합니다. 스키마 덤프만으로 외부 플랫폼 서비스가 재현되지는 않습니다.\n\n이 내보내기는 아카이브 해독/체크섬까지 검증하며 실제 DB 재생성/앱 로그인 복구를 시험한 것은 아닙니다.\n`;
  await writeFile(join(staging,'RESTORE.md'),instructions,{mode:0o600});
  if(assets)await writeFile(join(staging,'RESTORE.md'),instructions.replace('이 파일만으로 Storage/Drive의 바이너리 원본까지 포함되지는 않습니다. 진행 중인 Google assets/records 백업을 함께 보관하세요.', 'assets/에 Storage 전체 파일과 DB 덤프에서 발견한 공개 Google Drive 이미지 원본이 들어 있습니다. asset-manifest.json의 sourceKey, bucket/path 또는 driveFileId로 원본 참조를 찾고 bytes/SHA-256을 확인하세요. Storage 메타데이터는 database.dump에도 있지만 바이너리는 별도로 해당 경로에 올려야 합니다. 외부 링크 이미지 및 비공개 Drive 파일은 별도 자격 증명이 필요할 수 있습니다. 이후 변경 사항은 Google assets/records 자동 백업과 함께 보관하세요.'),{mode:0o600});
  const names=['database.dump','schema.sql','database-contents.txt','roles.sql','recovery-settings.json','RESTORE.md',...(assets?['asset-manifest.json']:[])];
  const checksums=Object.fromEntries(await Promise.all(names.map(async name=>[name,await sha(join(staging,name))])));
  const manifest={format:'gm-note-portable-v1',createdAt:new Date().toISOString(),databaseDumpTool:execFileSync(tool('pg_dump'),['--version'],{encoding:'utf8'}).trim(),sourceFiles:files,checksums,assetsIncluded:!!assets,storageAssetCount:assets?.storageCount||0,driveAssetCount:assets?.driveCount||0,databaseRestoreTested:false};
  await writeFile(join(staging,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  const archive=join(staging,'portable.tar.gz');
  await run('tar',['-czf',archive,'-C',staging,...names,'manifest.json','source',...(assets?['assets']:[])]);
  const encrypted=join(output,'gm-note-portable.enc');await encrypt(archive,encrypted,config.BACKUP_ENCRYPTION_KEY);
  const roundtrip=join(staging,'verified.tar.gz');await decrypt(encrypted,roundtrip,config.BACKUP_ENCRYPTION_KEY);
  if(await sha(archive)!==await sha(roundtrip))throw new Error('EXPORT_ENCRYPTION_MISMATCH');
  await run('tar',['-tzf',roundtrip]);
  const result={format:manifest.format,createdAt:manifest.createdAt,sourceFileCount:files.length,encryptedFile:'gm-note-portable.enc',sha256:await sha(encrypted),schemaExtracted:true,databaseRestoreTested:false,assetsIncluded:!!assets,storageAssetCount:assets?.storageCount||0,driveAssetCount:assets?.driveCount||0,assetBytes:assets?.bytes||0};
  await writeFile(join(output,'export-status.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log('Encrypted migration package verified:',encrypted);
  console.log('Source files:',files.length,'; original assets:',assets?.files.length||0);
} catch(e) {
  console.error(/^EXPORT_[A-Z_]+$/.test(e.message||'')?e.message:'EXPORT_FAILED_PRIVATE_DETAILS_SUPPRESSED');process.exitCode=1;
  if(e.safeDetails)console.error('TLS diagnostics (no credentials):',JSON.stringify(e.safeDetails));
} finally {
  // Delete only this fresh, verified temp staging directory; never source data.
  if(staging){const safe=resolve(staging),parent=resolve(tmpdir());if(!safe.startsWith(parent+sep)||!safe.split(sep).at(-1).startsWith('gm-note-portable-'))throw new Error('EXPORT_UNSAFE_TEMP_PATH');await rm(safe,{recursive:true,force:true});}
}
