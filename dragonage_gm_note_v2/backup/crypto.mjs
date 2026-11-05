import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, rm, writeFile, appendFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
const magic = Buffer.from('DABACKUP1');
function keyBytes(key) {
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32) throw new Error('Backup key must be 32 bytes (base64)');
  return bytes;
}
export async function encrypt(input, output, key) {
  const header = Buffer.concat([magic, randomBytes(12)]);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), header.subarray(magic.length));
  cipher.setAAD(header);
  await writeFile(output, header, { flag: 'wx', mode: 0o600 });
  try {
    await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: 'r+', start: header.length }));
    await appendFile(output, cipher.getAuthTag());
  } catch (error) { await rm(output, { force: true }); throw error; }
}
export async function decrypt(input, output, key) {
  const size = (await stat(input)).size;
  const file = await open(input, 'r');
  const header = Buffer.alloc(magic.length + 12), tag = Buffer.alloc(16);
  try {
    if (size < header.length + tag.length) throw new Error('Invalid encrypted backup');
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, 16, size - 16);
  } finally { await file.close(); }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Invalid backup header');
  const cipher = createDecipheriv('aes-256-gcm', keyBytes(key), header.subarray(magic.length));
  cipher.setAAD(header); cipher.setAuthTag(tag);
  try { await pipeline(createReadStream(input, { start: header.length, end: size - 17 }), cipher, createWriteStream(output, { flags: 'wx', mode: 0o600 })); }
  catch (error) { await rm(output, { force: true }); throw error; }
}
