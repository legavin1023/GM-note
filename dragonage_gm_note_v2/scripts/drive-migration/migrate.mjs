// Run from repository root. Credentials are read from process.env only.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  callGas,
  TYPES,
  MAX_BYTES,
  driveUrl,
} from "../../supabase/functions/drive-image-upload/protocol.mjs";
import {
  BUCKETS,
  hash,
  objectKey,
  quote,
  rewrite,
  makeLookup,
  sourceImageType,
} from "./helpers.mjs";

const root = resolve("data/drive-migration");
const command = process.argv[2];
const commands = [
  "inventory",
  "backup",
  "copy",
  "verify-files",
  "plan",
  "apply",
  "verify",
  "rollback",
];
const required = (name) => {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
};
const json = (name) => readFile(join(root, name), "utf8").then(JSON.parse);
async function save(name, value) {
  const path = join(root, name),
    tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}
async function dbClient() {
  let pg;
  try {
    pg = createRequire(import.meta.url)("../../backup/node_modules/pg");
  } catch {
    throw new Error(
      "Install existing backup dependencies: npm.cmd ci --prefix backup"
    );
  }
  const db = new pg.Client({
    connectionString: required("MIGRATION_DATABASE_URL"),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 30000,
  });
  await db.connect();
  return db;
}
async function storageInventory(db) {
  const buckets = (
    await db.query(
      "SELECT id FROM storage.buckets WHERE id=ANY($1) ORDER BY id",
      [BUCKETS]
    )
  ).rows;
  if (buckets.length !== BUCKETS.length)
    throw new Error(
      "One or more requested buckets are missing; inspect inventory before proceeding"
    );
  return (
    await db.query(
      "SELECT id,bucket_id,name,metadata,created_at,updated_at FROM storage.objects WHERE bucket_id=ANY($1) ORDER BY bucket_id,name",
      [BUCKETS]
    )
  ).rows.map((o) => JSON.parse(JSON.stringify(o)));
}
async function unchangedInventory(db, inventory) {
  if (
    JSON.stringify(await storageInventory(db)) !==
    JSON.stringify(inventory.objects)
  )
    throw new Error(
      "STORAGE_CHANGED: rerun inventory in a new backup directory during maintenance"
    );
}
async function scanTables(db) {
  const tables = (
    await db.query(`SELECT c.table_name,array_agg(c.column_name ORDER BY c.ordinal_position) FILTER (WHERE c.udt_name IN ('text','varchar','json','jsonb','_text','_varchar')) AS columns
    FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name !~ '^gm_backup_' GROUP BY c.table_name ORDER BY c.table_name`)
  ).rows;
  for (const t of tables) {
    t.pk = (
      await db.query(
        `SELECT a.attname FROM pg_index i
      JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,position) ON k.position<=i.indnkeyatts
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`,
        [`public.${quote(t.table_name)}`]
      )
    ).rows.map((r) => r.attname);
    t.rows = (
      await db.query(
        `SELECT to_jsonb(t) AS row FROM public.${quote(t.table_name)} t`
      )
    ).rows.map((r) => r.row);
  }
  return tables;
}
const sourcePath = (o) => join(root, "originals", `${o.id}.bin`);
async function verifiedBackup() {
  const info = await json("backup.json");
  if (
    !info.complete ||
    hash(await readFile(join(root, "database.json"))) !== info.databaseSha256
  )
    throw new Error("DATABASE_BACKUP_INVALID");
  for (const o of info.objects) {
    const bytes = await readFile(sourcePath(o));
    if (hash(bytes) !== o.sha256 || bytes.length !== o.bytes)
      throw new Error("ORIGINAL_BACKUP_INVALID");
  }
  return info;
}
async function main() {
  if (!commands.includes(command))
    throw new Error(
      `Usage: node scripts/drive-migration/migrate.mjs ${commands.join("|")}`
    );
  await mkdir(join(root, "originals"), { recursive: true });
  const db = await dbClient();
  try {
    if (command === "inventory") {
      // Never overwrite a backup or a completed mapping on accidental rerun.
      try {
        await readFile(join(root, "inventory.json"));
        throw new Error(
          "INVENTORY_EXISTS: reuse commands or archive directory privately for a fresh run"
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const objects = await storageInventory(db);
      await save("inventory.json", {
        version: 1,
        site: new URL(required("SUPABASE_URL")).origin,
        createdAt: new Date().toISOString(),
        objects,
      });
      console.log(
        "Inventory saved:",
        objects.length,
        "objects in",
        BUCKETS.length,
        "buckets"
      );
      return;
    }
    const inventory = await json("inventory.json");
    if (inventory.site !== new URL(required("SUPABASE_URL")).origin)
      throw new Error("PROJECT_MISMATCH");
    if (command === "backup") {
      try {
        await readFile(join(root, "backup.json"));
        throw new Error(
          "BACKUP_EXISTS: keep the original snapshot for rollback"
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await unchangedInventory(db, inventory);
      const tables = await scanTables(db);
      await save("database.json", {
        createdAt: new Date().toISOString(),
        tables,
      });
      await db.query("COMMIT");
      const objects = [];
      const key = required("SUPABASE_SERVICE_ROLE_KEY");
      for (const o of inventory.objects) {
        const response = await fetch(
          `${inventory.site}/storage/v1/object/${encodeURIComponent(
            o.bucket_id
          )}/${o.name.split("/").map(encodeURIComponent).join("/")}`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(120000),
            redirect: "error",
          }
        );
        if (!response.ok)
          throw new Error(`STORAGE_DOWNLOAD_HTTP_${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (
          o.metadata?.size != null &&
          Number(o.metadata.size) !== bytes.length
        )
          throw new Error("STORAGE_SIZE_CHANGED");
        await writeFile(sourcePath(o), bytes, { mode: 0o600 });
        objects.push({ ...o, sha256: hash(bytes), bytes: bytes.length });
      }
      await unchangedInventory(db, inventory);
      await save("backup.json", {
        complete: true,
        databaseSha256: hash(await readFile(join(root, "database.json"))),
        objects,
      });
      console.log(
        "Complete backup:",
        objects.length,
        "original files and all public table rows"
      );
      return;
    }
    const backup = await verifiedBackup();
    if (command === "copy") {
      const mapping = await json("mapping.json").catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return {};
      });
      await save("mapping.json", mapping);
      required("GAS_WEB_APP_URL");
      required("GAS_SHARED_SECRET");
      const owner = required("MIGRATION_GM_USER_ID");
      if (!/^[a-f0-9-]{36}$/i.test(owner))
        throw new Error("Invalid MIGRATION_GM_USER_ID");
      for (const o of backup.objects) {
        const key = objectKey(o);
        if (
          mapping[key]?.status === "copied" &&
          mapping[key]?.sha256 === o.sha256
        )
          continue;
        const mimeType = sourceImageType(o);
        if (!mimeType) {
          mapping[key] = { status: "skipped-non-image", sha256: o.sha256 };
          await save("mapping.json", mapping);
          continue;
        }
        try {
          if (!TYPES.includes(mimeType))
            throw new Error("UNSUPPORTED_IMAGE_TYPE");
          if (o.bytes > MAX_BYTES || !o.bytes) throw new Error("IMAGE_SIZE");
          const bytes = await readFile(sourcePath(o));
          const operationId = hash(`${inventory.site}:${key}:${o.sha256}`);
          const result = await callGas(required("GAS_WEB_APP_URL"), {
            action: "upload",
            secret: required("GAS_SHARED_SECRET"),
            requestId: randomUUID(),
            operationId,
            userId: owner,
            isGM: true,
            name: o.name,
            mimeType,
            base64: bytes.toString("base64"),
          });
          if (result.sha256 !== o.sha256)
            throw new Error("DRIVE_CHECKSUM_MISMATCH");
          mapping[key] = {
            status: "copied",
            id: result.id,
            url: driveUrl(result.id),
            sha256: o.sha256,
          };
        } catch (e) {
          // Raw provider errors and signed URLs must never reach logs/artifacts.
          mapping[key] = {
            status: "failed",
            sha256: o.sha256,
            code: /^[A-Z_]+$/.test(e.code || e.message)
              ? e.code || e.message
              : "COPY_FAILED",
          };
        }
        await save("mapping.json", mapping);
      }
      const failed = Object.values(mapping).filter(
        (r) => r.status === "failed"
      ).length;
      console.log(
        "Copy complete; failed:",
        failed,
        "(rerun copy to retry only unfinished files)"
      );
      if (failed) process.exitCode = 1;
      return;
    }
    const mapping = await json("mapping.json");
    if (command === "plan") {
      await unchangedInventory(db, inventory);
      if (
        backup.objects.some(
          (o) =>
            sourceImageType(o) && mapping[objectKey(o)]?.status !== "copied"
        )
      )
        throw new Error("INCOMPLETE_COPY");
      const overrides = await json("overrides.json").catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return {};
      });
      const snapshot = await json("database.json"),
        changes = [];
      for (const t of snapshot.tables)
        for (const row of t.rows) {
          const old = {},
            next = {};
          for (const col of t.columns || []) {
            const value = rewrite(
              row[col],
              makeLookup(
                backup.objects,
                mapping,
                inventory.site,
                overrides,
                `${t.table_name}.${col}`
              )
            );
            if (!isDeepStrictEqual(value, row[col])) {
              old[col] = row[col];
              next[col] = value;
            }
          }
          if (!Object.keys(next).length) continue;
          if (!t.pk.length)
            throw new Error(
              `Affected table has no primary key: ${t.table_name}`
            );
          changes.push({
            table: t.table_name,
            key: Object.fromEntries(t.pk.map((c) => [c, row[c]])),
            old,
            next,
          });
        }
      await save("plan.json", {
        databaseSha256: backup.databaseSha256,
        mappingSha256: hash(await readFile(join(root, "mapping.json"))),
        changes,
      });
      console.log(
        "Review plan.json before apply:",
        changes.length,
        "rows; original values are included for rollback"
      );
      return;
    }
    const plan = ["apply", "rollback"].includes(command)
      ? await json("plan.json")
      : null;
    if (
      plan &&
      (plan.databaseSha256 !== backup.databaseSha256 ||
        plan.mappingSha256 !== hash(await readFile(join(root, "mapping.json"))))
    )
      throw new Error("PLAN_BACKUP_MISMATCH");
    if (["apply", "rollback"].includes(command)) {
      if (!process.argv.includes("--execute"))
        throw new Error("Review plan.json first, then add --execute");
      if (command === "apply") {
        const checked = await json("file-verification.json");
        if (
          checked.failedImages ||
          checked.mappingSha256 !== plan.mappingSha256
        )
          throw new Error("DRIVE_FILES_NOT_VERIFIED");
      }
      await unchangedInventory(db, inventory);
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL lock_timeout='10s'");
        const tables = [...new Set(plan.changes.map((c) => c.table))].sort();
        for (const t of tables)
          await db.query(
            `LOCK TABLE public.${quote(t)} IN SHARE ROW EXCLUSIVE MODE`
          );
        // Validate every source before changing anything. No lost concurrent edits.
        for (const c of plan.changes) {
          const where = Object.keys(c.key)
            .map((col, i) => `${quote(col)}=$${i + 1}`)
            .join(" AND ");
          const rows = (
            await db.query(
              `SELECT to_jsonb(t) AS row FROM public.${quote(
                c.table
              )} t WHERE ${where} FOR UPDATE`,
              Object.values(c.key)
            )
          ).rows;
          const expected = command === "apply" ? c.old : c.next;
          if (
            rows.length !== 1 ||
            Object.entries(expected).some(
              ([col, v]) => !isDeepStrictEqual(rows[0].row[col], v)
            )
          )
            throw new Error(
              "DB_CHANGED: plan/rollback conflict; transaction cancelled"
            );
        }
        // A full rollback source is durable before the transaction starts writes.
        await save(`${command}-journal.json`, {
          startedAt: new Date().toISOString(),
          planSha256: hash(await readFile(join(root, "plan.json"))),
          changes: plan.changes,
        });
        for (const c of plan.changes) {
          const target = command === "apply" ? c.next : c.old;
          const columns = Object.keys(target);
          const where = Object.keys(c.key)
            .map((col, i) => `t.${quote(col)}=$${i + 2}`)
            .join(" AND ");
          // jsonb_populate_record preserves native text[], JSONB, null and types.
          await db.query(
            `UPDATE public.${quote(c.table)} t SET ${columns
              .map((col) => `${quote(col)}=v.${quote(col)}`)
              .join(",")}
            FROM jsonb_populate_record(NULL::public.${quote(
              c.table
            )},$1::jsonb) v WHERE ${where}`,
            [JSON.stringify(target), ...Object.values(c.key)]
          );
        }
        // Triggers may transform protected author fields; abort if any target differs.
        for (const c of plan.changes) {
          const where = Object.keys(c.key)
            .map((col, i) => `${quote(col)}=$${i + 1}`)
            .join(" AND ");
          const row = (
            await db.query(
              `SELECT to_jsonb(t) AS row FROM public.${quote(
                c.table
              )} t WHERE ${where}`,
              Object.values(c.key)
            )
          ).rows[0]?.row;
          const expected = command === "apply" ? c.next : c.old;
          if (
            !row ||
            Object.entries(expected).some(
              ([col, v]) => !isDeepStrictEqual(row[col], v)
            )
          )
            throw new Error("TRIGGER_CHANGED_TARGET: transaction cancelled");
        }
        await db.query("COMMIT");
        await save(`${command}-complete.json`, {
          completedAt: new Date().toISOString(),
          rows: plan.changes.length,
        });
        console.log(command, "committed:", plan.changes.length, "rows");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
      return;
    }
    if (command === "verify" || command === "verify-files") {
      await unchangedInventory(db, inventory);
      let failed = 0,
        copied = 0;
      const checks = [];
      for (const o of backup.objects) {
        const r = mapping[objectKey(o)];
        if (!sourceImageType(o)) continue;
        let ok = r?.status === "copied" && r.sha256 === o.sha256;
        if (ok) {
          // Public thumbnail is the actual URL used by <img>; no credentials.
          try {
            const stored = await callGas(required("GAS_WEB_APP_URL"), {
              action: "inspect",
              secret: required("GAS_SHARED_SECRET"),
              requestId: randomUUID(),
              userId: required("MIGRATION_GM_USER_ID"),
              isGM: true,
              id: r.id,
            });
            ok =
              stored.sha256 === o.sha256 &&
              stored.bytes === o.bytes &&
              stored.trashed === false;
            const response = await fetch(r.url, {
              signal: AbortSignal.timeout(30000),
            });
            const bytes = new Uint8Array(await response.arrayBuffer());
            ok =
              ok &&
              response.ok &&
              (response.headers.get("content-type") || "").startsWith(
                "image/"
              ) &&
              bytes.length > 0;
          } catch {
            ok = false;
          }
        }
        copied++;
        if (!ok) failed++;
        checks.push({ source: objectKey(o), ok });
      }
      // Detect remaining legacy references, including embedded URLs and JSON arrays.
      const live = command === "verify" ? await scanTables(db) : [];
      let remaining = 0;
      const overrides = await json("overrides.json").catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return {};
      });
      for (const t of live)
        for (const row of t.rows)
          for (const col of t.columns || []) {
            const next = rewrite(
              row[col],
              makeLookup(
                backup.objects,
                mapping,
                inventory.site,
                overrides,
                `${t.table_name}.${col}`
              )
            );
            if (!isDeepStrictEqual(next, row[col])) remaining++;
          }
      await save(
        command === "verify" ? "verification.json" : "file-verification.json",
        {
          checkedAt: new Date().toISOString(),
          mappingSha256: hash(await readFile(join(root, "mapping.json"))),
          imageCount: copied,
          failedImages: failed,
          remainingReferences: command === "verify" ? remaining : null,
          checks,
          browserRenderingVerified: false,
        }
      );
      console.log(
        "Verification:",
        copied,
        "images,",
        failed,
        "failed HTTP image checks,",
        remaining,
        "remaining DB references; browser rendering still needs manual QA"
      );
      if (failed || remaining) process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((e) => {
    // Do not print PostgreSQL/provider errors, connection URLs or secret values.
    const safe =
      /^(Missing |Usage: |Install existing |Review plan|Inventory|INVENTORY_EXISTS|BACKUP_EXISTS|Affected table|AMBIGUOUS_PATH|UNMIGRATED_REFERENCE|DB_CHANGED|STORAGE_CHANGED|TRIGGER_CHANGED_TARGET)/.test(
        e.message
      ) || /^[A-Z_0-9]+$/.test(e.message);
    console.error(
      safe
        ? e.message
        : "Migration failed; credentials and provider details suppressed. DB transaction was rolled back if not committed."
    );
    process.exitCode = 1;
  });
}
