// Decrypt only; never restores into a live database automatically.
import { decrypt } from './crypto.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output || !process.env.BACKUP_ENCRYPTION_KEY) throw new Error('Usage: BACKUP_ENCRYPTION_KEY=... node restore.mjs input.enc output.tar.gz');
await decrypt(input, output, process.env.BACKUP_ENCRYPTION_KEY);
console.log('Archive authenticated and decrypted. Extract into a private directory; see recovery instructions.');
