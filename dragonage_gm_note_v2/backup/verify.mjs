import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
const dir = resolve(process.argv[2] || '.');
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
async function verify(name, expected, bytes) {
  const file = resolve(dir, name);
  if (!file.startsWith(dir + sep)) throw new Error('Unsafe archive path');
  const hash = createHash('sha256'); for await (const b of createReadStream(file)) hash.update(b);
  if (hash.digest('hex') !== expected || (bytes != null && (await stat(file)).size !== bytes)) throw new Error(`Integrity mismatch: ${name}`);
}
for (const [name, hash] of Object.entries(manifest.checksums)) await verify(name, hash);
for (const object of manifest.objects) await verify(object.file, object.sha256, object.bytes);
console.log(`Verified database, recovery metadata and ${manifest.objects.length} Storage files (${manifest.created_at})`);
