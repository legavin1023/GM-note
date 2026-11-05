// Administrative setup only; credentials are captured in memory and never printed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const tls = require('node:tls');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ref = 'cammbwzdpymunyobvszu';
const ca = path.join(os.tmpdir(), 'webpush-system-ca.pem');
fs.writeFileSync(ca, tls.getCACertificates('system').join('\n'));
const environment = { ...process.env, NODE_EXTRA_CA_CERTS: ca, NODE_USE_SYSTEM_CA: '1', GIT_SSL_CAINFO: ca };
function cli(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), ...args], { cwd: root, env: environment, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error('Supabase CLI request failed; sensitive output suppressed');
  return JSON.parse(result.stdout);
}
function githubCredential() {
  const result = spawnSync('git', ['credential', 'fill'], { cwd: root, env: { ...environment, GIT_TERMINAL_PROMPT: '0' }, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  if (result.status !== 0) throw new Error('GitHub login is needed; no credential printed');
  const fields = Object.fromEntries(result.stdout.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim()]; }));
  if (!fields.password) throw new Error('No GitHub credential available');
  return fields.password;
}
async function api(token, endpoint, options = {}) {
  const response = await fetch('https://api.github.com' + endpoint, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type':'application/json', 'X-GitHub-Api-Version': '2022-11-28', ...options.headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) { const detail=await response.json().catch(()=>({})); throw new Error(`GitHub API ${response.status} (${endpoint}): ${detail.message || 'request failed'}; credentials suppressed`); }
  return response.status === 204 ? null : response.json();
}
async function main() {
  const token = githubCredential();
  const repo = '/repos/legavin1023/dragonage-trpg-backups';
  const action = process.argv[2] || 'inspect';
  if(action==='scopes') { const r=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token}`}}); console.log('GitHub granted scopes:',r.headers.get('x-oauth-scopes')); return; }
  if(action==='dispatch') { await api(token,repo+'/actions/workflows/weekly-backup.yml/dispatches',{method:'POST',body:JSON.stringify({ref:'main'})}); console.log('Full backup started'); return; }
  if(action==='pause') {
    await api(token,repo+'/actions/workflows/weekly-backup.yml/disable',{method:'PUT'});
    const runs=await api(token,repo+'/actions/runs?per_page=20');
    for(const run of runs.workflow_runs.filter(r=>['queued','in_progress','waiting','requested','pending'].includes(r.status))) {
      await api(token,repo+`/actions/runs/${run.id}/cancel`,{method:'POST'});
      console.log('Cancelled active backup',run.id);
    }
    console.log('Weekly backup disabled; files and configuration retained'); return;
  }
  if (action === 'status') {
    const runs = await api(token, repo + '/actions/runs?per_page=3');
    console.log(JSON.stringify(runs.workflow_runs.map(r => ({ id:r.id, status:r.status, conclusion:r.conclusion, url:r.html_url }))));
    const artifacts = await api(token, repo + '/actions/artifacts');
    console.log(JSON.stringify(artifacts.artifacts.map(a => ({ id:a.id, name:a.name, bytes:a.size_in_bytes }))));
    return;
  }
  if (action === 'logs') {
    const runs = await api(token, repo + '/actions/runs?per_page=1');
    const jobs = await api(token, repo + `/actions/runs/${runs.workflow_runs[0].id}/jobs`);
    console.log(JSON.stringify(jobs.jobs.map(j => ({id:j.id, conclusion:j.conclusion, steps:j.steps.map(s=>({name:s.name,conclusion:s.conclusion}))}))));
    for(const job of jobs.jobs) {
      const response = await fetch('https://api.github.com'+repo+`/actions/jobs/${job.id}/logs`,{headers:{Authorization:`Bearer ${token}`}});
      if(response.ok) {
        const log=await response.text();
        console.log(log.split('\n').filter(l=> /error|failed|permission denied|Complete encrypted|Retained|pg_dump:/i.test(l)).join('\n'));
      }
    }
    return;
  }
  if (action === 'keys-shape') {
    const data = cli(['projects','api-keys','--project-ref',ref,'--reveal','-o','json']);
    console.log(JSON.stringify(data, (k,v)=> /key|secret|token/i.test(k)&&typeof v==='string'?'[redacted]':v)); return;
  }
  if (action === 'configure' || action === 'publish') {
    let secrets;
    const saved = path.join(root,'.backup.local.env');
    if (fs.existsSync(saved)) secrets = JSON.parse(fs.readFileSync(saved,'utf8'));
    else {
      if(action==='publish') throw new Error('Configure first');
      const password = randomBytes(32).toString('hex');
      const url = new URL(fs.readFileSync(path.join(root,'supabase/.temp/pooler-url'),'utf8').trim());
      url.username = `dragonage_weekly_backup.${ref}`; url.password = password;
      const keys = cli(['projects','api-keys','--project-ref',ref,'--reveal','-o','json']);
      const entries = Array.isArray(keys)?keys:(keys.api_keys || keys.keys);
      const service = entries.find(k=>k.name==='service_role')?.api_key;
      if (!service) throw new Error('Service key unavailable');
      secrets = { BACKUP_DATABASE_URL:url.href, BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('base64'), SUPABASE_SERVICE_ROLE_KEY:service, SUPABASE_URL:`https://${ref}.supabase.co`, RECOVERY_CONFIG:JSON.stringify(Object.fromEntries(['.env','supabase/functions/.env'].filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]))) };
      fs.writeFileSync(saved,JSON.stringify(secrets,null,2),{mode:0o600});
      const sql = `CREATE ROLE dragonage_weekly_backup LOGIN PASSWORD '${password}' BYPASSRLS CONNECTION LIMIT 3; GRANT pg_read_all_data TO dragonage_weekly_backup; ALTER ROLE dragonage_weekly_backup SET default_transaction_read_only = on; GRANT USAGE ON SCHEMA vault TO dragonage_weekly_backup; GRANT SELECT ON vault.decrypted_secrets TO dragonage_weekly_backup;`;
      const file=path.join(root,'.backup-role.sql'); fs.writeFileSync(file,sql,{mode:0o600});
      try { cli(['db','query','--linked','--project-ref',ref,'--file',file]); } finally { fs.unlinkSync(file); }
      console.log('Read-only database login configured');
    }
    let metadata;
    try { metadata = await api(token,repo); }
    catch(e) { if(!e.message.includes('404'))throw e; metadata=await api(token,'/user/repos',{method:'POST',body:JSON.stringify({name:'dragonage-trpg-backups',private:true,auto_init:true,description:'Private encrypted weekly database and Storage backups'})}); }
    if(!metadata.private) throw new Error('Backup repository must be private');
    if(action==='configure') {
      const sodium = require(path.join(root,'.backup-tools/node_modules/libsodium-wrappers')); await sodium.ready;
      const pub = await api(token,repo+'/actions/secrets/public-key');
      for(const [name,value] of Object.entries(secrets)) {
        const encrypted_value = sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value),sodium.from_base64(pub.key,sodium.base64_variants.ORIGINAL)),sodium.base64_variants.ORIGINAL);
        await api(token,repo+'/actions/secrets/'+name,{method:'PUT',body:JSON.stringify({encrypted_value,key_id:pub.key_id})});
      }
      console.log('Private repository and encrypted GitHub Secrets configured');
    }
    const branch = metadata.default_branch;
    const head = await api(token,repo+'/git/ref/heads/'+branch);
    const base = await api(token,repo+'/git/commits/'+head.object.sha);
    console.log('Preparing backup files on branch', branch, 'base tree', base.tree.sha);
    const files = fs.readdirSync(path.join(root,'backup')).filter(f=>fs.statSync(path.join(root,'backup',f)).isFile());
    const tree=[];
    for(const f of files) {
      const blob=await api(token,repo+'/git/blobs',{method:'POST',body:JSON.stringify({content:fs.readFileSync(path.join(root,'backup',f)).toString('base64'),encoding:'base64'})});
      tree.push({path:f==='weekly-backup.yml'?'.github/workflows/weekly-backup.yml':f,mode:'100644',type:'blob',sha:blob.sha});
    }
    const newTree=await api(token,repo+'/git/trees',{method:'POST',body:JSON.stringify({base_tree:base.tree.sha,tree})});
    const commit=await api(token,repo+'/git/commits',{method:'POST',body:JSON.stringify({message:'Configure complete encrypted weekly backups',tree:newTree.sha,parents:[head.object.sha]})});
    await api(token,repo+'/git/refs/heads/'+branch,{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});
    await api(token,repo+'/actions/workflows/weekly-backup.yml/dispatches',{method:'POST',body:JSON.stringify({ref:branch})});
    console.log('Backup workflow published and first run started'); return;
  }
  const user = await api(token, '/user');
  const original = await api(token, '/repos/legavin1023/GM-note');
  console.log('GitHub account:', user.login, 'site repository private:', original.private);
  const diagnostic = cli(['db', 'query', '--linked', '--project-ref', ref, '--file', 'supabase/diagnostics_backup.sql']);
  console.log('Backup volume:', JSON.stringify(diagnostic.rows));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
