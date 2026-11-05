import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './crypto.mjs';
test('archive round trip and authentication reject corruption without retaining plaintext', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  try {
    const data = randomBytes(1024 * 1024 + 3), key = randomBytes(32).toString('base64');
    await writeFile(join(dir, 'in'), data);
    await encrypt(join(dir, 'in'), join(dir, 'enc'), key);
    await decrypt(join(dir, 'enc'), join(dir, 'out'), key);
    assert.deepEqual(await readFile(join(dir, 'out')), data);
    const corrupt = await readFile(join(dir, 'enc')); corrupt[30] ^= 1;
    await writeFile(join(dir, 'corrupt'), corrupt);
    await assert.rejects(decrypt(join(dir, 'corrupt'), join(dir, 'bad'), key));
    await assert.rejects(access(join(dir, 'bad')));
    await assert.rejects(decrypt(join(dir, 'enc'), join(dir, 'wrong'), randomBytes(32).toString('base64')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
