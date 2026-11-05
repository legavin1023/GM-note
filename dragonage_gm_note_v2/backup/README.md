# Dragonage private weekly backups

Private repository for encrypted PostgreSQL + all Supabase Storage files.
Schedule: Monday 04:17 KST. Latest four successful artifacts, maximum 95 MB each, 35-day expiry.
Actions → Weekly full encrypted backup → Run workflow for manual execution.
Download the encrypted artifact from a successful run. Never publish decrypted data or credentials.

Secrets: BACKUP_DATABASE_URL (read-only role), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_ENCRYPTION_KEY (base64 32 bytes), RECOVERY_CONFIG.
Keep the encryption key independently; GitHub Secrets cannot be read back.

Decrypt with `BACKUP_ENCRYPTION_KEY=... node restore.mjs input.enc output.tar.gz`, extract privately, then `node verify.mjs extracted-directory`.
Restore must be tested separately before touching production. Supabase managed schemas require selective restore; Storage files need re-upload using manifest paths. Vault plaintext is inside the encrypted archive for re-registration in a new project.
The application's `docs/weekly-backup.md` contains Korean recovery instructions.
