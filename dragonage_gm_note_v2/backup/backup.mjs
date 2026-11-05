import pg from 'pg';
import { mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { encrypt } from './crypto.mjs';
const required = name => { if (!process.env[name]) throw new Error(`Missing ${name}`); return process.env[name]; };
const staging = resolve('.staging'), output = resolve('output');
const dbUrl = new URL(required('BACKUP_DATABASE_URL'));
const key = required('BACKUP_ENCRYPTION_KEY'), service = required('SUPABASE_SERVICE_ROLE_KEY');
const site = required('SUPABASE_URL');
const db = new pg.Client({ connectionString: dbUrl.href, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 30000 });
function run(command, args, env = process.env) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let diagnostic = ''; child.stderr.on('data', b => { diagnostic += b.toString(); });
    child.on('error', () => fail(new Error(`${command} could not start`)));
    child.on('exit', code => {
      // PostgreSQL diagnostics do not contain credential URLs; redact anyway.
      if (code) console.error(diagnostic.replaceAll(service, '[redacted]').replaceAll(decodeURIComponent(dbUrl.password), '[redacted]'));
      code ? fail(new Error(`${command} failed (${code})`)) : ok();
    });
  });
}
async function sha(file) { const hash = createHash('sha256'); for await (const b of createReadStream(file)) hash.update(b); return hash.digest('hex'); }
async function download(object) {
  if (!/^[0-9a-f-]{36}$/i.test(object.id)) throw new Error('Invalid storage object ID');
  const url = `${site}/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { headers: { apikey: service, Authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Storage download failed (HTTP ${response.status}, object ${object.id})`);
  const file = `storage/${object.id}.bin`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${staging}/${file}`, { flags: 'wx', mode: 0o600 }));
  const bytes = (await stat(`${staging}/${file}`)).size;
  if (object.metadata?.size != null && bytes !== Number(object.metadata.size)) throw new Error(`Storage changed during backup: ${object.id}`);
  return { ...object, file, bytes, sha256: await sha(`${staging}/${file}`) };
}
try {
  await mkdir(`${staging}/storage`, { recursive: true }); await mkdir(output, { recursive: true });
  await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const objects = (await db.query('SELECT * FROM storage.objects ORDER BY id')).rows;
  const buckets = (await db.query('SELECT * FROM storage.buckets ORDER BY id')).rows;
  const roles = (await db.query('SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, rolconfig FROM pg_roles ORDER BY rolname')).rows;
  const memberships = (await db.query('SELECT pg_get_userbyid(roleid) AS role, pg_get_userbyid(member) AS member, admin_option FROM pg_auth_members')).rows;
  const vault = (await db.query('SELECT id, name, description, decrypted_secret, created_at, updated_at FROM vault.decrypted_secrets')).rows;
  const environment = { ...process.env, PGHOST: dbUrl.hostname, PGPORT: dbUrl.port || '5432', PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password), PGDATABASE: dbUrl.pathname.slice(1), PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt' };
  await run('docker', ['run', '--rm', '--network', 'host', '-v', `${staging}:/backup`, '-v', '/etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro', ...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGSSLROOTCERT'].flatMap(n => ['-e', n]), 'postgres:17', 'pg_dump', '--format=custom', '--no-password', `--snapshot=${snapshot}`, '--file=/backup/database.dump'], environment);
  await writeFile(`${staging}/roles.json`, JSON.stringify({ roles, memberships }, null, 2), { mode: 0o600 });
  await writeFile(`${staging}/vault.json`, JSON.stringify(vault, null, 2), { mode: 0o600 });
  await db.query('COMMIT'); await db.end();
  const files = [];
  for (let i = 0; i < objects.length; i += 4) files.push(...await Promise.all(objects.slice(i, i + 4).map(download)));
  // Detect additions, deletions and modifications since the DB snapshot.
  const check = new pg.Client({ connectionString: dbUrl.href, ssl: { rejectUnauthorized: true } });
  await check.connect();
  try {
    const latest = (await check.query('SELECT id, updated_at FROM storage.objects ORDER BY id')).rows;
    if (JSON.stringify(latest) !== JSON.stringify(objects.map(({ id, updated_at }) => ({ id, updated_at })))) throw new Error('Storage inventory changed during backup; retry for a complete snapshot');
  } finally { await check.end(); }
  if (process.env.RECOVERY_CONFIG) await writeFile(`${staging}/recovery-config.json`, required('RECOVERY_CONFIG'), { mode: 0o600 });
  const metadata = ['database.dump', 'roles.json', 'vault.json', ...(process.env.RECOVERY_CONFIG ? ['recovery-config.json'] : [])];
  const checksums = Object.fromEntries(await Promise.all(metadata.map(async file => [file, await sha(`${staging}/${file}`)])));
  await writeFile(`${staging}/manifest.json`, JSON.stringify({ version: 1, project: 'cammbwzdpymunyobvszu', created_at: new Date().toISOString(), buckets, objects: files, checksums }, null, 2));
  await run('tar', ['-czf', `${output}/backup.tar.gz`, '-C', staging, '.']);
  await encrypt(`${output}/backup.tar.gz`, `${output}/dragonage.backup.enc`, key);
  const bytes = (await stat(`${output}/dragonage.backup.enc`)).size;
  if (bytes > 95000000) throw new Error('Encrypted archive exceeds 95 MB safety limit; adjust storage plan before increasing');
  console.log(`Complete encrypted backup: ${files.length} storage objects, ${bytes} bytes, ${buckets.length} buckets`);
} finally {
  await db.end().catch(() => {});
  await rm(staging, { recursive: true, force: true });
  await rm(`${output}/backup.tar.gz`, { force: true });
}
