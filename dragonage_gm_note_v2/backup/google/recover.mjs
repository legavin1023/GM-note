// Reconstruct and verify local recovery data only. Never writes to a database.
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  open,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, sep, basename, dirname } from "node:path";
import { decryptEvent } from "../../supabase/functions/google-backup/helpers.mjs";
async function allFiles(folder) {
  const result=[];for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isSymbolicLink())throw new Error("BACKUP_LINK_NOT_ALLOWED");if(entry.isDirectory())result.push(...await allFiles(path));else if(entry.isFile())result.push(path);}return result;
}
const args = process.argv.slice(2),
  mode = args[0];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function output(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
}
try {
  if (mode === "events") {
    const input = resolve(args[1]),
      destination = resolve(args[2]);
    if (input === destination || destination.startsWith(input + sep))
      throw new Error("BACKUP_SEPARATE_OUTPUT_REQUIRED");
    const key =
      process.env.GOOGLE_BACKUP_ENCRYPTION_KEY ||
      JSON.parse(await readFile(".google-backup.local.env", "utf8"))
        .GOOGLE_BACKUP_ENCRYPTION_KEY;
    const unique = new Map();
    const roots=[];for(const name of ["latest","records"]){const path=join(input,name);if(await stat(path).then(s=>s.isDirectory()).catch(()=>false))roots.push(path);}
    const files=(await Promise.all((roots.length?roots:[input]).map(allFiles))).flat();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const event = await decryptEvent(
        JSON.parse(await readFile(file, "utf8")),
        key
      );
      if (!/^\d+$/.test(event.sequence) || !event.payload?.dataset)
        throw new Error("BACKUP_EVENT_INVALID");
      if (
        unique.has(event.eventId) &&
        JSON.stringify(unique.get(event.eventId)) !== JSON.stringify(event)
      )
        throw new Error("BACKUP_EVENT_CONFLICT");
      unique.set(event.eventId, event);
    }
    if (!unique.size) throw new Error("BACKUP_NO_EVENTS");
    const events = [...unique.values()].sort((a, b) =>
      BigInt(a.sequence) < BigInt(b.sequence)
        ? -1
        : BigInt(a.sequence) > BigInt(b.sequence)
        ? 1
        : 0
    );
    const latest = new Map();
    for (const event of events) {
      const p = event.payload,
        identity = (key) =>
          `${p.dataset}/${p.schema}/${p.table}/${JSON.stringify(key)}`;
      if (p.oldKey && JSON.stringify(p.oldKey) !== JSON.stringify(p.key))
        latest.set(identity(p.oldKey), {
          dataset: p.dataset,
          schema: p.schema,
          table: p.table,
          key: p.oldKey,
          row: p.before,
          deleted: true,
          sequence: event.sequence,
          eventId: event.eventId,
        });
      latest.set(identity(p.key), {
        dataset: p.dataset,
        schema: p.schema,
        table: p.table,
        key: p.key,
        row: p.after || p.before,
        deleted: p.op === "DELETE",
        sequence: event.sequence,
        eventId: event.eventId,
      });
    }
    await mkdir(destination, { recursive: true });
    await output(join(destination, "latest-rows.json"), [...latest.values()]);
    await output(join(destination, "recovery-report.json"), {
      events: events.length,
      records: latest.size,
      deleted: [...latest.values()].filter((x) => x.deleted).length,
      datasets: [...new Set(events.map((x) => x.payload.dataset))],
    });
    console.log(
      "Authenticated and reconstructed:",
      events.length,
      "events;",
      latest.size,
      "records. No database was changed."
    );
  } else if (mode === "assets") {
    const input = resolve(args[1]);
    let count = 0;
    for (const file of await allFiles(input))
      if (file.endsWith(".manifest.json")) {
        const m = JSON.parse(await readFile(file, "utf8"));
        if (
          m.format !== "gm-note-asset-v1" ||
          basename(m.fileName) !== m.fileName
        )
          throw new Error("BACKUP_ASSET_MANIFEST");
        const bytes = await readFile(join(dirname(file), m.fileName));
        if (bytes.length !== m.bytes || hash(bytes) !== m.sha256)
          throw new Error("BACKUP_ASSET_CHECKSUM");
        count++;
      }
    if (!count) throw new Error("BACKUP_NO_ASSETS");
    console.log("Verified portable original-file manifests:", count);
  } else if (mode === "snapshot") {
    const manifestPath = resolve(args[1]),
      destination = resolve(args[2]);
    const m = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      m.format !== "gm-note-snapshot-v1" ||
      !Array.isArray(m.parts) ||
      !m.parts.length
    )
      throw new Error("BACKUP_SNAPSHOT_MANIFEST");
    const source = resolve(manifestPath, ".."),
      h = createHash("sha256");
    // Verify all chunks before creating the joined encrypted archive.
    for (let i = 0; i < m.parts.length; i++) {
      const p = m.parts[i];
      if (p.part !== i || !/^snapshot-[a-f0-9]{64}$/.test(m.snapshotId))
        throw new Error("BACKUP_SNAPSHOT_MANIFEST");
      const bytes = await readFile(
        join(
          source,
          m.snapshotId + ".part-" + String(i).padStart(6, "0") + ".enc"
        )
      );
      if (bytes.length !== p.bytes || hash(bytes) !== p.sha256)
        throw new Error("BACKUP_PART_CHECKSUM");
      h.update(bytes);
    }
    if (h.digest("hex") !== m.sha256)
      throw new Error("BACKUP_SNAPSHOT_CHECKSUM");
    const handle = await open(destination, "wx", 0o600);
    try {
      for (let i = 0; i < m.parts.length; i++) {
        const bytes = await readFile(
          join(
            source,
            m.snapshotId + ".part-" + String(i).padStart(6, "0") + ".enc"
          )
        );
        await handle.writeFile(bytes);
      }
    } finally {
      await handle.close();
    }
    if ((await stat(destination)).size !== m.bytes)
      throw new Error("BACKUP_SNAPSHOT_SIZE");
    console.log(
      "Reassembled and verified encrypted full snapshot. Decrypt with backup/restore.mjs."
    );
  } else
    throw new Error(
      "BACKUP_USAGE: recover.mjs events|assets|snapshot input [output]"
    );
} catch (e) {
  console.error(
    /^BACKUP_[A-Z_: |\[\]a-z.]+$/.test(e.message || "")
      ? e.message
      : "BACKUP_RECOVERY_FAILED"
  );
  process.exitCode = 1;
}
