import { readFile } from "node:fs/promises";
import { googleRequest } from "./transport.mjs";
try {
  const settings = JSON.parse(
    await readFile(".google-backup.local.env", "utf8")
  );
  const result = await googleRequest(
    settings.GAS_WEB_APP_URL,
    settings.GAS_BACKUP_SHARED_SECRET,
    { action: "backupStatus" }
  );
  console.log("Google backup deployment ready:", result.backupVersion);
  console.log("Private spreadsheet:", result.spreadsheetUrl);
  console.log("Private backup folder:", result.folderUrl);
  console.log(
    "This checks setup only. Verify queue counts and an actual changed record separately."
  );
} catch (e) {
  console.error(
    /^BACKUP_[A-Z_]+$/.test(e.message || "")
      ? e.message
      : "BACKUP_STATUS_FAILED"
  );
  process.exitCode = 1;
}
