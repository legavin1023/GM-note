// Authenticate, unpack into a fresh OS temp directory, and check every manifest.
// Never connects to or restores a database. No credentials are printed.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { decrypt } from './crypto.mjs';
const sha=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
let staging;
try {
  const input=resolve(process.argv[2]||'');
  if(!process.argv[2])throw new Error('VERIFY_INPUT_REQUIRED');
  const config=JSON.parse(await readFile('.backup.local.env','utf8'));
  staging=await mkdtemp(join(tmpdir(),'gm-note-verify-'));
  const archive=join(staging,'archive.tar.gz');
  await decrypt(input,archive,config.BACKUP_ENCRYPTION_KEY);
  const tar=args=>execFileSync('tar',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
  const members=tar(['-tzf',archive]).split(/\r?\n/).filter(Boolean);
  for(const member of members){const normal=member.replaceAll('\\','/');if(normal.startsWith('/')||/^[a-z]:/i.test(normal)||normal.split('/').includes('..'))throw new Error('VERIFY_ARCHIVE_PATH');}
  if(tar(['-tvzf',archive]).split(/\r?\n/).filter(Boolean).some(line=>!['-','d'].includes(line[0])))throw new Error('VERIFY_ARCHIVE_LINK');
  tar(['-xzf',archive,'-C',staging]);
  const manifest=JSON.parse(await readFile(join(staging,'manifest.json'),'utf8'));
  if(manifest.format!=='gm-note-portable-v1')throw new Error('VERIFY_FORMAT');
  const checkedPath=name=>{const path=resolve(staging,name);if(!path.startsWith(staging+sep))throw new Error('VERIFY_MANIFEST_PATH');return path;};
  let checked=0;
  for(const [name,expected] of Object.entries(manifest.checksums)){if(await sha(checkedPath(name))!==expected)throw new Error('VERIFY_CHECKSUM');checked++;}
  for(const file of manifest.sourceFiles){if(await sha(checkedPath('source/'+file.path))!==file.sha256)throw new Error('VERIFY_SOURCE_CHECKSUM');checked++;}
  let assets=0,assetBytes=0;
  if(manifest.assetsIncluded){
    const mapping=JSON.parse(await readFile(join(staging,'asset-manifest.json'),'utf8'));
    for(const file of mapping.files){if(await sha(checkedPath(file.file))!==file.sha256)throw new Error('VERIFY_ASSET_CHECKSUM');assets++;assetBytes+=file.bytes;checked++;}
    if(assets!==mapping.storageCount+mapping.driveCount||assetBytes!==mapping.bytes)throw new Error('VERIFY_ASSET_COUNT');
  }
  const pgBin=process.env.PORTABLE_PG_BIN||'C:/Program Files/PostgreSQL/18/bin';
  const toc=execFileSync(join(pgBin,process.platform==='win32'?'pg_restore.exe':'pg_restore'),['--list',join(staging,'database.dump')],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
  const schema=await readFile(join(staging,'schema.sql'),'utf8');
  const result={verifiedAt:new Date().toISOString(),encryptedSha256:await sha(input),authenticated:true,checksumsVerified:checked,sourceFiles:manifest.sourceFiles.length,assets,assetBytes,dumpReadable:true,tableDataEntries:(toc.match(/ TABLE DATA /g)||[]).length,rlsEnabledTables:(schema.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,databaseRestoreTested:false};
  await writeFile(join(dirname(input),'verification.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result));
}catch{console.error('VERIFY_FAILED_PRIVATE_DETAILS_SUPPRESSED');process.exitCode=1;}
finally{if(staging){const path=resolve(staging);if(!path.startsWith(resolve(tmpdir())+sep)||!path.split(sep).at(-1).startsWith('gm-note-verify-'))throw new Error('VERIFY_UNSAFE_TEMP_PATH');await rm(path,{recursive:true,force:true});}}
