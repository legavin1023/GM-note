import { open, stat, readFile, mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { googleRequest } from "./transport.mjs";
async function sha(file) {
  const h = createHash("sha256");
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest("hex");
}
export async function uploadSnapshot(
  file,
  settings = process.env,
  { request = googleRequest } = {}
) {
  const url = settings.GAS_WEB_APP_URL,
    secret = settings.GAS_BACKUP_SHARED_SECRET;
  if (!url || !secret) throw new Error("BACKUP_GOOGLE_SETTINGS_MISSING");
  const handle = await open(file, "r"),
    info = await stat(file),
    digest = await sha(file);
  const snapshotId = "snapshot-" + digest;
  const manifest = {
    format: "gm-note-snapshot-v1",
    snapshotId,
    createdAt: new Date().toISOString(),
    bytes: info.size,
    sha256: digest,
    parts: [],
  };
  try {
    const magic = Buffer.alloc(9);
    await handle.read(magic, 0, 9, 0);
    if (magic.toString() !== "DABACKUP1")
      throw new Error("BACKUP_ENCRYPTED_FILE_REQUIRED");
    const size = 4 * 1024 * 1024;
    for (let offset = 0, part = 0; offset < info.size; offset += size, part++) {
      const bytes = Buffer.alloc(Math.min(size, info.size - offset));
      const got = await handle.read(bytes, 0, bytes.length, offset);
      if (got.bytesRead !== bytes.length)
        throw new Error("BACKUP_FILE_CHANGED");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const result = await request(url, secret, {
        action: "backupPart",
        snapshotId,
        part,
        base64: bytes.toString("base64"),
        sha256: checksum,
      });
      if (
        result.part !== part ||
        result.sha256 !== checksum ||
        result.bytes !== bytes.length
      )
        throw new Error("BACKUP_PART_RECEIPT");
      manifest.parts.push({
        part,
        id: result.id,
        sha256: checksum,
        bytes: bytes.length,
      });
    }
    if ((await sha(file)) !== digest) throw new Error("BACKUP_FILE_CHANGED");
    const result = await request(
      url,
      secret,
      { action: "backupComplete", manifest },
      { timeout: 300000 }
    );
    if (
      result.snapshotId !== snapshotId ||
      result.verifiedParts !== manifest.parts.length
    )
      throw new Error("BACKUP_COMPLETE_RECEIPT");
    return { ...result, manifest };
  } finally {
    await handle.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("BACKUP_INPUT_REQUIRED");
    let settings = process.env;
    const configArg = process.argv.indexOf("--config");
    if (configArg >= 0)
      settings = {
        ...process.env,
        ...JSON.parse(await readFile(process.argv[configArg + 1], "utf8")),
      };
    const result = await uploadSnapshot(file, settings);
    await mkdir("backup/google/output", { recursive: true });
    await writeFile(
      "backup/google/output/latest-upload.json",
      JSON.stringify(result, null, 2),
      { mode: 0o600 }
    );
    console.log(
      "Google encrypted snapshot uploaded and part checksums verified:",
      result.verifiedParts,
      "parts"
    );
  } catch (e) {
    console.error(
      /^BACKUP_[A-Z_]+$/.test(e.message) ? e.message : "BACKUP_UPLOAD_FAILED"
    );
    process.exitCode = 1;
  }
}
