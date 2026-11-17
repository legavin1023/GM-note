import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as helpers from "../supabase/functions/google-backup/helpers.mjs";
import { uploadSnapshot } from "../backup/google/upload.mjs";
import { googleRequest } from "../backup/google/transport.mjs";
import { encrypt, decrypt } from "../backup/crypto.mjs";

const key = Buffer.alloc(32, 7).toString("base64"),
  secret = "test-only-private-backup-secret";
const event = {
  eventId: "11111111-1111-4111-8111-111111111111",
  sequence: "9007199254740993",
  payload: {
    dataset: "22222222-2222-4222-8222-222222222222",
    schema: "public",
    table: "team_art_posts",
    op: "INSERT",
    key: { id: "post-1" },
    before: null,
    after: {
      id: "post-1",
      content: "private_text",
      password_hash: "private_hash",
      image_paths: [],
    },
    at: "2026-11-11T04:00:00Z",
  },
};
test("event archives authenticate full Korean content, credentials, event identity and key", async () => {
  const original = {
    ...event,
    payload: {
      ...event.payload,
      after: {
        content: "한글 댓글 ".repeat(10000),
        password_hash: "private_hash",
      },
    },
  };
  const encrypted = await helpers.encryptEvent(original, key);
  assert(!JSON.stringify(encrypted).includes("private_hash"));
  assert.deepEqual(await helpers.decryptEvent(encrypted, key), original);
  await assert.rejects(
    helpers.decryptEvent(
      { ...encrypted, eventId: "33333333-3333-4333-8333-333333333333" },
      key
    )
  );
  await assert.rejects(
    helpers.decryptEvent(encrypted, Buffer.alloc(32, 8).toString("base64"))
  );
  await assert.rejects(
    helpers.decryptEvent(
      { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -4) + "AAAA" },
      key
    )
  );
});
test("Sheets preview redacts credentials while preserving character lore and original event", () => {
  const row = {
    password_hash: "hash",
    login_pin: "1234",
    nested: { access_token: "token", api_key: "key" },
    gm_secret: "비밀 설정",
    token_url: "https://drive.google.com/thumbnail?id=valid_file_123",
  };
  const safe = helpers.sheetSafe(row);
  assert.equal(safe.gm_secret, row.gm_secret);
  assert.equal(safe.token_url, row.token_url);
  for (const s of [
    safe.password_hash,
    safe.login_pin,
    safe.nested.access_token,
    safe.nested.api_key,
  ])
    assert.equal(s, "[암호화 백업에 보관]");
  assert.equal(row.password_hash, "hash");
});
test("asset discovery covers all three old buckets, nested paths, current Drive IDs and log files", () => {
  const e = structuredClone(event);
  e.payload.after = {
    url: "https://project.supabase.co/storage/v1/object/public/campaign-assets/nested/%ED%95%9C.png",
    image_paths: [
      "user/posts/a/file.png",
      "https://project.supabase.co/storage/v1/object/sign/post-images/a.png?token=old",
      "https://drive.google.com/thumbnail?id=drive_file_123456789&sz=w1600",
    ],
    storage_path: "team/log.html",
  };
  e.payload.before = {
    image_path:
      "https://project.supabase.co/storage/v1/object/public/free-board-images/b.png",
  };
  const keys = helpers
    .discoverAssets(e, "https://project.supabase.co")
    .map((x) => x.key);
  for (const key of [
    "storage/campaign-assets/nested/한.png",
    "storage/post-images/a.png",
    "storage/free-board-images/b.png",
    "legacy/user/posts/a/file.png",
    "drive/drive_file_123456789",
    "storage/team-log-backups/team/log.html",
  ])
    assert(keys.includes(key));
  e.payload = {
    ...e.payload,
    schema: "storage",
    table: "objects",
    after: {
      bucket_id: "other-bucket",
      name: "nested/no-extension",
      updated_at: "version-1",
    },
    before: null,
  };
  assert.deepEqual(helpers.discoverAssets(e, "https://project.supabase.co"), [
    {
      key: "storage/other-bucket/nested/no-extension",
      type: "storage",
      bucket: "other-bucket",
      path: "nested/no-extension",
      revision: "version-1",
    },
  ]);
});
function signedHeaders(now = Date.now(), otherSecret = secret) {
  const stamp = String(Math.floor(now / 1000)),
    nonce = "44444444-4444-4444-8444-444444444444";
  return new Headers({
    "x-backup-timestamp": stamp,
    "x-backup-nonce": nonce,
    "x-backup-signature": createHmac("sha256", otherSecret)
      .update(stamp + "." + nonce)
      .digest("hex"),
  });
}
test("database wakeup uses expiring HMAC; static secret headers and old/forged signatures fail", async () => {
  const now = Date.now();
  assert(await helpers.verifyWebhook(signedHeaders(now), secret, now));
  assert(
    !(await helpers.verifyWebhook(signedHeaders(now - 360000), secret, now))
  );
  assert(
    !(await helpers.verifyWebhook(signedHeaders(now, "wrong"), secret, now))
  );
  assert(
    !(await helpers.verifyWebhook(
      new Headers({ "x-backup-secret": secret }),
      secret,
      now
    ))
  );
});

const gasCode =
  (await readFile(
    new URL("../google-apps-script/Code.gs", import.meta.url),
    "utf8"
  )) +
  "\n" +
  (await readFile(
    new URL("../google-apps-script/Backup.gs", import.meta.url),
    "utf8"
  ));
const organizationCode=await readFile(new URL("../google-apps-script/Organization.gs",import.meta.url),"utf8");
function gasHarness(options={}) {
  const props = {
      BACKUP_SHARED_SECRET: secret,
      SHARED_SECRET: "image-only-secret",
      DRIVE_FOLDER_ID: "image-folder",
    },
    files = new Map(),
    books = new Map(),
    logs = [];
  let serial = 0,
    fetches = 0;
  const iter = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  const blob = (bytes, mime = "image/png", name = "image") => ({
    bytes:
      typeof bytes === "string" ? [...Buffer.from(bytes)] : Array.from(bytes),
    mime,
    name,
    getBytes() {
      return this.bytes;
    },
    setName(n) {
      this.name = n;
      return this;
    },
  });
  function file(name, b, parent = null, folder = false) {
    const f = {
      id: "drive_file_id_" + serial++,
      name,
      b,
      parent,
      folder,
      access: "private",
      description: "",
      children: [],
      getId() {
        return this.id;
      },
      getName() {
        return this.name;
      },
      getUrl() {
        return `https://drive.google.com/file/d/${this.id}/view`;
      },
      getBlob() {
        return this.b;
      },
      getMimeType() {
        return this.b?.mime || "application/vnd.google-apps.folder";
      },
      isTrashed() { return this.trashed===true; },
      setTrashed(v) {this.trashed=v;},
      getDescription() {
        return this.description;
      },
      setDescription(v) {
        this.description = v;
      },
      getSharingAccess() {
        return this.access;
      },
      moveTo(p) {
        if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);
        this.parent = p;
        if(!p.children.includes(this))p.children.push(this);
      },
      getParents() {
        return iter(this.parent ? [this.parent] : []);
      },
      getFiles() {return iter(this.children.filter(x=>!x.folder&&!x.trashed));},
      getFolders() {return iter(this.children.filter(x=>x.folder&&!x.trashed));},
      getFilesByName(n) {
        return iter(this.children.filter((x) => !x.folder && !x.trashed && x.name === n));
      },
      getFoldersByName(n) {
        return iter(this.children.filter((x) => x.folder && !x.trashed && x.name === n));
      },
      createFolder(n) {
        return file(n, null, this, true);
      },
      createFile(a, c, m) {
        const b = typeof a === "string" ? blob(c, m, a) : a;
        return file(b.name, b, this);
      },
    };
    files.set(f.id, f);
    if (parent) parent.children.push(f);
    return f;
  }
  class Sheet {
    constructor(name) {
      this.name = name;
      this.data = [];
      this.maxRows = 1000;
      this.maxCols = 26;
    }
    setName(n) {
      this.name = n;
      return this;
    }
    getName() {
      return this.name;
    }
    getLastRow() {
      return this.data.length;
    }
    getLastColumn() {
      return Math.max(0, ...this.data.map((r) => r.length));
    }
    getMaxRows() {
      return this.maxRows;
    }
    getMaxColumns() {
      return this.maxCols;
    }
    insertRowsAfter(_, n) {
      this.maxRows += n;
    }
    insertColumnsAfter(_, n) {
      this.maxCols += n;
    }
    deleteRows(start,count){this.data.splice(start-1,count);}
    setFrozenRows() {}
    setColumnWidth() {}
    setColumnWidths() {}
    getRange(row, col, n = 1, m = 1) {
      const s = this;
      const range = {
        getRow: () => row,
        getValues: () =>
          Array.from({ length: n }, (_, i) =>
            Array.from(
              { length: m },
              (_, j) => s.data[row + i - 1]?.[col + j - 1] ?? ""
            )
          ),
        getDisplayValue: () => String(s.data[row - 1]?.[col - 1] ?? ""),
        setValues(v) {
          for (let i = 0; i < n; i++) {
            s.data[row + i - 1] ??= [];
            for (let j = 0; j < m; j++)
              s.data[row + i - 1][col + j - 1] = v[i][j];
          }
          return range;
        },
        createTextFinder(text) {
          return {
            matchEntireCell() {
              return this;
            },
            useRegularExpression() {
              return this;
            },
            findNext() {
              for (let i = 0; i < n; i++)
                if (String(s.data[row + i - 1]?.[col - 1]) === text)
                  return s.getRange(row + i, col);
              return null;
            },
          };
        },
      };
      for (const method of [
        "setNumberFormat",
        "setBackground",
        "setFontColor",
        "setFontWeight",
        "setWrap",
        "setVerticalAlignment",
      ])
        range[method] = () => range;
      return range;
    }
  }
  const triggers=[];
  const sandbox = {
    ScriptApp: {getProjectTriggers:()=>triggers,newTrigger:(handler)=>({timeBased(){return this;},everyMinutes(n){this.minutes=n;return this;},create(){triggers.push({getHandlerFunction:()=>handler});}})},
    console: { info: (x) => logs.push(x), error: (x) => logs.push(x) },
    MimeType: { PLAIN_TEXT: "text/plain" },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props[k],
        setProperty: (k, v) => (props[k] = v),
      }),
    },
    DriveApp: {
      Access: { PRIVATE: "private" },
      createFolder: (n) => file(n, null, null, true),
      getFolderById: (id) => files.get(id),
      getFilesByName: (n) => iter([...files.values()].filter(f=>!f.folder&&!f.trashed&&f.name===n)),
      getFileById: (id) => files.get(id),
    },
    LockService: {
      getUserLock: () => ({
        tryLock: () => true,
        hasLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      newBlob: (b, m, n) => blob(b, m, n),
      base64Decode: (s) => [...Buffer.from(s, "base64")],
      formatDate: (d,tz) => new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(d),
      computeDigest: (_, b) => [
        ...createHash("sha256").update(Buffer.from(b)).digest(),
      ],
      DigestAlgorithm: { SHA_256: "sha" },
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ setMimeType: () => text }),
    },
    SpreadsheetApp: {
      create: () => {
        const f = file(
          "book",
          blob("", "application/vnd.google-apps.spreadsheet")
        );
        const book = {
          sheets: [new Sheet("Sheet1")],
          getId: () => f.id,
          getUrl: () => `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
          getSheets() {
            return this.sheets;
          },
          getSheetByName(n) {
            return this.sheets.find((s) => s.name === n);
          },
          insertSheet(n) {
            const s = new Sheet(n);
            this.sheets.push(s);
            return s;
          },
        };
        books.set(f.id, book);
        return book;
      },
      openById: (id) => books.get(id),
      flush: () => {},
    },
    UrlFetchApp: {
      fetch: () => {
        fetches++;
        return {
          getResponseCode: () => 200,
          getBlob: () => blob([137, 80, 78, 71, 13, 10, 26, 10]),
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(gasCode+(options.organized?"\n"+organizationCode:""), sandbox);
  sandbox.setupGoogleBackup();
  const liveRoot=file("live-images",null,null,true);liveRoot.id=props.DRIVE_FOLDER_ID;files.set(liveRoot.id,liveRoot);
  return {
    sandbox,
    props,
    files,
    books,
    logs,
    triggers,
    fetches: () => fetches,
    post: (body) =>
      JSON.parse(
        sandbox.gmBackupHandle({ requestId: event.eventId, secret, ...body })
      ),
  };
}
async function gasEvent(h, e = event, assets = []) {
  return h.post({
    action: "backupEvent",
    event: {
      ...e,
      payload: {
        ...e.payload,
        before: helpers.sheetSafe(e.payload.before),
        after: helpers.sheetSafe(e.payload.after),
      },
    },
    encrypted: await helpers.encryptEvent(e, key),
    assets,
    storageOrigin: "https://project.supabase.co",
  });
}
test("GAS public fingerprint identifies the deployed backup handler without secrets", () => {
  const h = gasHarness();
  const result = JSON.parse(h.sandbox.doGet());
  assert.equal(result.backupReady, true);
  assert.equal(result.deploymentCheck, "backup-router-check-1");
  assert.deepEqual(Object.keys(result).sort(), ["backupReady", "deploymentCheck", "ok", "organizationVersion", "version"]);
  assert(!JSON.stringify(result).includes(secret));
});
test("GAS creates private backup outside image folder and separates image/backup secrets", () => {
  const h = gasHarness();
  assert.notEqual(h.props.BACKUP_FOLDER_ID, h.props.DRIVE_FOLDER_ID);
  assert.equal(
    h.post({ action: "backupStatus", secret: "image-only-secret" }).code,
    "BACKUP_AUTH"
  );
  h.files.get(h.props.BACKUP_FOLDER_ID).access = "public";
  assert.equal(h.post({ action: "backupStatus" }).code, "BACKUP_PRIVATE");
  assert(!h.logs.join("").includes(secret));
});
test("ordinary row references reuse an existing versioned original without downloading twice", async () => {
  const h = gasHarness();
  const asset = { key: "storage/campaign-assets/original.png", type: "storage", revision: "version-one", downloadUrl: "https://project.supabase.co/storage/v1/object/sign/campaign-assets/original.png?token=test" };
  assert.equal((await gasEvent(h, event, [asset])).ok, true);
  const next = structuredClone(event);
  next.eventId = "88888888-8888-4888-8888-888888888888";
  next.sequence = "9007199254740994";
  const reference = { ...asset }; delete reference.revision;
  assert.equal((await gasEvent(h, next, [reference])).ok, true);
  assert.equal(h.fetches(), 1);
  assert.equal(h.books.get(h.props.BACKUP_SPREADSHEET_ID).getSheetByName("파일목록").getLastRow(), 2);
});
test("retries do not duplicate archives, Sheets rows, history or old image backups", async () => {
  const h = gasHarness(),
    assets = [
      {
        key: "storage/campaign-assets/path.png",
        type: "storage",
        downloadUrl:
          "https://project.supabase.co/storage/v1/object/sign/campaign-assets/path.png?token=test",
      },
    ];
  assert.equal((await gasEvent(h, event, assets)).ok, true);
  const count = h.files.size;
  assert.equal((await gasEvent(h, event, assets)).ok, true);
  assert.equal(h.files.size, count);
  assert.equal(h.fetches(), 1);
  const book = h.books.get(h.props.BACKUP_SPREADSHEET_ID);
  assert.equal(book.getSheetByName("게시글").getLastRow(), 2);
  assert.equal(book.getSheetByName("변경이력").getLastRow(), 2);
  assert.equal(book.getSheetByName("파일목록").getLastRow(), 2);
  assert([...h.files.values()].some((f) => f.name.endsWith(".manifest.json")));
});
test("updates/deletes and out-of-order events retain newest sheet row and all historical versions", async () => {
  const h = gasHarness();
  await gasEvent(h);
  const next = structuredClone(event);
  next.eventId = "55555555-5555-4555-8555-555555555555";
  next.sequence = "9007199254740995";
  next.payload.op = "DELETE";
  next.payload.before = { id: "post-1", content: "deleted contents" };
  next.payload.after = null;
  await gasEvent(h, next);
  const old = structuredClone(event);
  old.eventId = "66666666-6666-4666-8666-666666666666";
  old.sequence = "9007199254740994";
  old.payload.after.content = "outdated";
  await gasEvent(h, old);
  const book = h.books.get(h.props.BACKUP_SPREADSHEET_ID),
    sheet = book.getSheetByName("게시글");
  assert.equal(sheet.data[1][1], next.sequence);
  assert.equal(sheet.data[1][2], "삭제");
  assert(sheet.data[1].includes("deleted contents"));
  assert.equal(book.getSheetByName("변경이력").getLastRow(), 4);
  assert.equal(
    h.sandbox.gmBackupText('=IMPORTXML("https://invalid")'),
    '\'=IMPORTXML("https://invalid")'
  );
  assert(h.sandbox.gmBackupText("x".repeat(50000)).length < 40001);
});
test("encrypted archives retain complete originals while Sheets credentials are redacted", async () => {
  const h = gasHarness();
  await gasEvent(h);
  const sheet = h.books
    .get(h.props.BACKUP_SPREADSHEET_ID)
    .getSheetByName("게시글");
  assert(!JSON.stringify(sheet.data).includes("private_hash"));
  const archive = [...h.files.values()].find((f) =>
    f.name.endsWith(event.eventId + ".json")
  );
  const restored = await helpers.decryptEvent(
    JSON.parse(Buffer.from(archive.b.bytes).toString()),
    key
  );
  assert.equal(restored.payload.after.password_hash, "private_hash");
});
test("GAS rejects external download URLs and unconfigured/missing original assets without marking success", async () => {
  const h = gasHarness();
  const result = await gasEvent(h, event, [
    {
      key: "storage/a/b",
      type: "storage",
      downloadUrl: "https://attacker.invalid/b",
    },
  ]);
  assert.equal(result.code, "BACKUP_ASSET_MISSING");
  assert.equal(h.fetches(), 0);
  assert.equal(
    h.books.get(h.props.BACKUP_SPREADSHEET_ID).getSheetByName("변경이력"),
    undefined
  );
});
test("encrypted full snapshot splits, validates receipts, downloads, rejoins and decrypts exactly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gm-backup-test-"));
  try {
    const source = join(dir, "original"),
      enc = join(dir, "archive.enc"),
      restored = join(dir, "restored");
    const data = randomBytes(5 * 1024 * 1024);
    await writeFile(source, data);
    await encrypt(source, enc, key);
    const h = gasHarness(),
      config = {
        GAS_WEB_APP_URL: "https://script.google.com/macros/s/deployment/exec",
        GAS_BACKUP_SHARED_SECRET: secret,
      };
    const uploaded = await uploadSnapshot(enc, config, {
      request: async (_url, _secret, body) => h.post(body),
    });
    assert.equal(uploaded.verifiedParts, 2);
    const again = await uploadSnapshot(enc, config, {
      request: async (_url, _secret, body) => h.post(body),
    });
    assert.equal(uploaded.manifestUrl, again.manifestUrl);
    const joined = join(dir, "joined.enc");
    for (const p of uploaded.manifest.parts)
      await writeFile(
        join(
          dir,
          uploaded.manifest.snapshotId +
            ".part-" +
            String(p.part).padStart(6, "0") +
            ".enc"
        ),
        Buffer.from(h.files.get(p.id).b.bytes)
      );
    const manifestPath = join(
      dir,
      uploaded.manifest.snapshotId + ".manifest.json"
    );
    await writeFile(manifestPath, JSON.stringify(uploaded.manifest));
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../backup/google/recover.mjs", import.meta.url)),
        "snapshot",
        manifestPath,
        joined,
      ],
      { stdio: "pipe" }
    );
    await decrypt(joined, restored, key);
    assert.deepEqual(await readFile(restored), data);
    await assert.rejects(
      uploadSnapshot(source, config, {
        request: async () => {
          throw new Error("must not upload plain data");
        },
      }),
      /BACKUP_ENCRYPTED_FILE_REQUIRED/
    );
  } finally {
    assert(dir.startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  }
});
test("local recovery reconstructs latest records and deletion markers from authenticated event files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gm-backup-recovery-"));
  try {
    const records = join(dir, "records"),
      output = join(dir, "recovered");
    await mkdir(records);
    const later = structuredClone(event);
    later.eventId = "77777777-7777-4777-8777-777777777777";
    later.sequence = "9007199254740994";
    later.payload.op = "DELETE";
    later.payload.before = later.payload.after;
    later.payload.after = null;
    for (const e of [event, later])
      await writeFile(
        join(records, e.eventId + ".json"),
        JSON.stringify(await helpers.encryptEvent(e, key))
      );
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../backup/google/recover.mjs", import.meta.url)),
        "events",
        records,
        output,
      ],
      {
        env: { ...process.env, GOOGLE_BACKUP_ENCRYPTION_KEY: key },
        stdio: "pipe",
      }
    );
    const rows = JSON.parse(
      await readFile(join(output, "latest-rows.json"), "utf8")
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deleted, true);
    assert.equal(rows[0].row.password_hash, "private_hash");
    assert.equal(rows[0].sequence, later.sequence);
  } finally {
    assert(dir.startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  }
});
test("snapshot upload redirects never forward shared secrets", async () => {
  const calls = [];
  await googleRequest(
    "https://script.google.com/macros/s/deployment/exec",
    secret,
    { action: "backupStatus" },
    {
      fetcher: async (url, opts) => {
        calls.push({ url, ...opts });
        return calls.length === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://script.googleusercontent.com/macros/echo?key=test",
              },
            })
          : Response.json({ ok: true, backupVersion: helpers.BACKUP_VERSION });
      },
    }
  );
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].body, undefined);
});
const edgeSource = stripTypeScriptTypes(
  (
    await readFile(
      new URL("../supabase/functions/google-backup/index.ts", import.meta.url),
      "utf8"
    )
  ).replace(/^import\s+[^;]+;\r?\n/gm, "")
);
test("private worker denies unsigned/browser requests before DB access and checks receipts before acknowledgment", async () => {
  let handler,
    dbCalls = 0,
    gasCalls = 0,
    wakeups = 0,
    badReceipt = false;
  const acknowledgments = [];
  const env = {
    GOOGLE_BACKUP_WEBHOOK_SECRET: secret,
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "private-service",
    GAS_WEB_APP_URL: "https://script.google.com/macros/s/deployment/exec",
    GAS_BACKUP_SHARED_SECRET: secret,
    GOOGLE_BACKUP_ENCRYPTION_KEY: key,
  };
  const sandbox = {
    Deno: { env: { get: (k) => env[k] }, serve: (h) => (handler = h) },
    console: { error: () => {}, info: () => {} },
    Response,
    URL,
    crypto: globalThis.crypto,
    ...helpers,
    createClient: () => {
      dbCalls++;
      return {
        rpc: async (name, args) => {
          if (name === "claim_google_backup")
            return { data: { token: "claim-token", events: [event] } };
          if (name === "finish_google_backup") acknowledgments.push(args);
          if (name === "request_google_backup") wakeups++;
          return { data: null };
        },
      };
    },
    callGas: async (_url, body) => {
      gasCalls++;
      assert(!JSON.stringify(body.event).includes("private_hash"));
      assert(JSON.stringify(body.encrypted).includes("ciphertext"));
      return {
        backupVersion: helpers.BACKUP_VERSION,
        eventId: badReceipt ? "wrong" : event.eventId,
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(edgeSource, sandbox);
  const request = (headers) =>
    new Request("https://edge.invalid", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "drain" }),
    });
  assert.equal(
    (await handler(request({ Authorization: "Bearer user-token" }))).status,
    401
  );
  assert.equal(dbCalls, 0);
  assert.equal((await handler(request(signedHeaders()))).status, 200);
  assert.equal(gasCalls, 1);
  assert.equal(acknowledgments[0].p_results[0].ok, true);
  assert.equal(wakeups, 1);
  badReceipt = true;
  assert.equal((await handler(request(signedHeaders()))).status, 503);
  assert.equal(acknowledgments[1].p_results[0].ok, false);
  assert.equal(acknowledgments[1].p_results[0].code, "BACKUP_RECEIPT");
  assert.equal(wakeups, 1, "failed batches must wait for cron instead of self-invoking");
});

function versioned(seq,at,id="post-1") {const e=structuredClone(event);e.sequence=String(seq);e.eventId=String(seq).padStart(8,"0")+"-1111-4111-8111-111111111111";e.payload.key={id};e.payload.after.id=id;e.payload.at=at;return e;}
function archived(h,e){return [...h.files.values()].find(f=>f.name===e.payload.dataset+"_"+e.eventId+".json");}
test("organized backups keep old-but-current rows and trash only obsolete versions outside the three Korean calendar days",async()=>{
 const h=gasHarness({organized:true});
 const first=versioned(100,"2026-11-10T03:00:00Z"),second=versioned(101,"2026-11-15T03:00:00Z"),unchanged=versioned(102,"2026-11-01T03:00:00Z","unchanged");
 for(const e of [first,second,unchanged])assert.equal((await gasEvent(h,e)).ok,true);
 const ctx=h.sandbox.gmBackupContext(false);
 const result=h.sandbox.gmOrganizationRetain(ctx,new Date("2026-11-16T10:00:00Z"));
 assert.equal(result.historyFilesTrashed,1);assert(archived(h,first).isTrashed());
 assert(!archived(h,second).isTrashed());assert(!archived(h,unchanged).isTrashed());
 assert.equal(archived(h,second).parent.name,"게시글");assert.equal(archived(h,second).parent.parent.name,"latest");
 assert.equal(h.sandbox.gmOrganizationDay("2026-11-14T15:00:00Z"),"2026-11-15");
 assert.equal(h.sandbox.gmOrganizationCutoff(new Date("2026-11-16T15:00:00Z")),"2026-11-15");
});
test("an out-of-order retry cannot replace the latest encrypted row and retries reuse the existing moved archive",async()=>{
 const h=gasHarness({organized:true}),newest=versioned(120,"2026-11-16T03:00:00Z"),old=versioned(119,"2026-11-11T03:00:00Z");
 for(const e of [newest,old,newest])assert.equal((await gasEvent(h,e)).ok,true);
 const ctx=h.sandbox.gmBackupContext(false),index=ctx.book.getSheetByName("최신백업색인");
 assert.equal(index.data[1][1],"120");assert.equal(index.data[1][2],archived(h,newest).id);
 assert.equal([...h.files.values()].filter(f=>f.name===archived(h,newest).name).length,1);
 assert.equal(archived(h,old).parent.parent.name,"2026-11-11");
});
test("retention rescues the currently indexed archive after an interrupted move and leaves unknown data, originals and snapshots intact",async()=>{
 const h=gasHarness({organized:true}),e=versioned(130,"2026-11-01T03:00:00Z");assert.equal((await gasEvent(h,e)).ok,true);
 const ctx=h.sandbox.gmBackupContext(false),file=archived(h,e),folder=h.sandbox.gmOrganizationHistory(ctx,"2026-11-01","게시글");
 file.moveTo(folder);const unknown=folder.createFile("manual.json","manual","text/plain");
 const original=ctx.assets.createFile("original","original","image/png"),snapshot=ctx.snapshots.createFile("baseline","baseline","application/octet-stream");
 const result=h.sandbox.gmOrganizationRetain(ctx,new Date("2026-11-16T10:00:00Z"));
 assert.equal(result.currentFilesProtected,1);assert(!file.isTrashed());assert.equal(file.parent.parent.name,"latest");
 for(const f of [unknown,original,snapshot])assert(!f.isTrashed());
});
test("legacy bootstrap is resumable and protects the current encrypted file before migrating or pruning history",async()=>{
 const h=gasHarness(),old=versioned(140,"2026-11-01T03:00:00Z"),current=versioned(141,"2026-11-02T03:00:00Z");
 assert.equal((await gasEvent(h,old)).ok,true);assert.equal((await gasEvent(h,current)).ok,true);
 vm.runInContext(organizationCode,h.sandbox);const ctx=h.sandbox.gmBackupContext(false);
 assert.equal(h.sandbox.gmOrganizationSeedLatest(ctx,1),true);
 h.sandbox.gmOrganizationMigrateLegacy(ctx,100);h.sandbox.gmOrganizationRetain(ctx,new Date("2026-11-16T10:00:00Z"));
 assert(archived(h,old).isTrashed());assert(!archived(h,current).isTrashed());assert.equal(archived(h,current).parent.parent.name,"latest");
 h.sandbox.setupOrganizedBackups();h.sandbox.setupOrganizedBackups();assert.equal(h.triggers.length,1);assert.equal(h.props.GM_BACKUP_RETENTION_DAYS,"3");
});

test("recovery reads categorized current records and daily history while excluding unrelated asset manifests",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gm-organized-recovery-"));
 try{
  const input=join(dir,"backup"),latest=join(input,"latest","게시글"),history=join(input,"records","2026-11-15","게시글"),output=join(dir,"recovered");
  await mkdir(latest,{recursive:true});await mkdir(history,{recursive:true});await mkdir(join(input,"assets"));
  const old=versioned(150,"2026-11-15T03:00:00Z"),current=versioned(151,"2026-11-16T03:00:00Z");current.payload.after.content="newest";
  await writeFile(join(history,"old.json"),JSON.stringify(await helpers.encryptEvent(old,key)));await writeFile(join(latest,"current.json"),JSON.stringify(await helpers.encryptEvent(current,key)));
  await writeFile(join(input,"assets","not-an-event.manifest.json"),JSON.stringify({format:"gm-note-asset-v1"}));
  execFileSync(process.execPath,[fileURLToPath(new URL("../backup/google/recover.mjs",import.meta.url)),"events",input,output],{env:{...process.env,GOOGLE_BACKUP_ENCRYPTION_KEY:key},stdio:"pipe"});
  const rows=JSON.parse(await readFile(join(output,"latest-rows.json"),"utf8"));assert.equal(rows.length,1);assert.equal(rows[0].row.content,"newest");
 }finally{assert(dir.startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});}
});

test("empty, null and non-object Drive descriptions are ignored without moving or deleting unrelated files",()=>{
 const h=gasHarness({organized:true}),ctx=h.sandbox.gmBackupContext(false);
 for(const raw of [null,"null","","[]","0","false",'"text"',"{bad"]){
  const f=ctx.assets.createFile("unknown-"+String(raw),"unmanaged","text/plain");f.setDescription(raw);
  assert.equal(typeof h.sandbox.gmOrganizationRecordMeta(f),"object");
  assert.notEqual(h.sandbox.gmOrganizationRecordMeta(f),null);
  assert.doesNotThrow(()=>h.sandbox.gmOrganizationAssets(ctx,100));
  assert.equal(f.parent,ctx.assets);assert.equal(f.isTrashed(),false);
 }
 const valid=ctx.assets.createFile("managed","bytes","image/png");valid.setDescription(JSON.stringify({app:"GM-note-backup",sourceKey:"storage/campaign-assets/npc-tokens/a.png"}));
 h.sandbox.gmOrganizationAssets(ctx,100);assert.equal(valid.parent.name,"NPC");assert.equal(valid.isTrashed(),false);
});
