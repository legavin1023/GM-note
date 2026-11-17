import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const path = ".google-backup.local.env";
try {
  await readFile(path);
  console.log("Existing private backup configuration retained.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  const previous = await readFile(".backup.local.env", "utf8")
    .then(JSON.parse)
    .catch(() => ({}));
  const config = {
    GAS_WEB_APP_URL: "",
    GAS_BACKUP_SHARED_SECRET: randomBytes(32).toString("base64url"),
    GOOGLE_BACKUP_WEBHOOK_SECRET: randomBytes(32).toString("base64url"),
    GOOGLE_BACKUP_ENCRYPTION_KEY:
      previous.BACKUP_ENCRYPTION_KEY || randomBytes(32).toString("base64"),
  };
  await writeFile(path, JSON.stringify(config, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Private settings created locally; secret values suppressed. Keep this recovery file separately."
  );
}
await mkdir("data/drive-diagnostics", { recursive: true });
const gas = (
  await Promise.all(
    ["google-apps-script/Code.gs", "google-apps-script/Backup.gs", "google-apps-script/Organization.gs"].map((p) =>
      readFile(p, "utf8")
    )
  )
).join("\n");
await writeFile("data/drive-diagnostics/Code-with-backup.gs", gas);
const protocol = (
  await readFile("supabase/functions/drive-image-upload/protocol.mjs", "utf8")
).replace(/^export /gm, "");
const helpers = (
  await readFile("supabase/functions/google-backup/helpers.mjs", "utf8")
).replace(/^export /gm, "");
const edge = (
  await readFile("supabase/functions/google-backup/index.ts", "utf8")
).replace(
  /^import\s+[^;]+?\s+from\s+["']\.(?:\.\/drive-image-upload\/protocol|\/helpers)\.mjs["'];?\r?\n/gm,
  ""
);
await writeFile(
  "data/drive-diagnostics/google-backup.paste.ts",
  protocol + "\n" + helpers + "\n" + edge
);
console.log(
  "Prepared Code-with-backup.gs and google-backup.paste.ts in data/drive-diagnostics."
);
