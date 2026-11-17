import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import * as protocol from "../supabase/functions/drive-image-upload/protocol.mjs";
import {
  driveFileId,
  functionFailure,
} from "../src/services/driveImageProtocol.mjs";
import {
  makeLookup,
  rewrite,
  hash,
  quote,
  sourceImageType,
  BUCKETS,
  objectKey,
} from "../scripts/drive-migration/helpers.mjs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const id = "drive_file_123456789";
const gasUrl = "https://script.google.com/macros/s/deployment123/exec";
const upload = { action: "upload", mimeType: "image/png", base64: png };
const success = () =>
  Response.json({ ok: true, id, version: protocol.VERSION });

test("upload validation accepts exact 10MB and rejects empty, malformed and oversized base64", () => {
  assert.equal(
    protocol.validateUpload(upload),
    Buffer.from(png, "base64").length
  );
  const full = Buffer.alloc(protocol.MAX_BYTES).toString("base64");
  assert.equal(
    protocol.validateUpload({ ...upload, base64: full }),
    protocol.MAX_BYTES
  );
  for (const base64 of [
    "",
    "a",
    "YWJj=",
    "====",
    "a a=",
    Buffer.alloc(protocol.MAX_BYTES + 1).toString("base64"),
  ]) {
    assert.throws(() => protocol.validateUpload({ ...upload, base64 }));
  }
  assert.throws(
    () => protocol.validateUpload({ ...upload, mimeType: "image/svg+xml" }),
    { code: "INVALID_TYPE" }
  );
});
test("ContentService redirect uses GET and never forwards the secret or image", async () => {
  const calls = [],
    logs = [];
  await protocol.callGas(
    gasUrl,
    { ...upload, secret: "private-test-secret" },
    {
      log: (x) => logs.push(x),
      fetcher: async (url, options) => {
        calls.push({ url, ...options });
        return calls.length === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://script.googleusercontent.com/macros/echo?key=one-time",
              },
            })
          : success();
      },
    }
  );
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].body, undefined);
  assert.equal(calls[1].headers, undefined);
  assert(!JSON.stringify(logs).includes("private-test-secret"));
  assert(!JSON.stringify(logs).includes("one-time"));
});
test("auth page, arbitrary host and 307 redirects are blocked without a second request", async () => {
  for (const [status, location] of [
    [302, "https://accounts.google.com/login"],
    [302, "https://attacker.invalid/macros/echo"],
    [307, "https://script.googleusercontent.com/macros/echo"],
  ]) {
    let count = 0;
    await assert.rejects(
      protocol.callGas(gasUrl, upload, {
        fetcher: async () => {
          count++;
          return new Response(null, { status, headers: { location } });
        },
      }),
      { code: "GAS_REDIRECT" }
    );
    assert.equal(count, 1);
  }
});
test("provider failures are distinct and never echo arbitrary provider text", async () => {
  for (const [response, code] of [
    [
      Response.json({
        ok: false,
        code: "GAS_AUTH",
        error: "private-test-secret",
      }),
      "GAS_AUTH",
    ],
    [Response.json({ ok: false, error: "인증 실패" }), "GAS_AUTH"],
    [Response.json({ ok: false, code: "GAS_SHARE" }), "GAS_SHARE"],
    [Response.json(null), "GAS_INTERNAL"],
    [new Response("<html>login private-test-secret</html>"), "GAS_NOT_JSON"],
    [new Response("denied", { status: 403 }), "GAS_HTTP"],
    [Response.json({ ok: true, id, version: "old" }), "GAS_VERSION"],
    [
      Response.json({ ok: true, id: "invalid", version: protocol.VERSION }),
      "GAS_PROTOCOL",
    ],
  ])
    await assert.rejects(
      protocol.callGas(gasUrl, upload, { fetcher: async () => response }),
      (e) => e.code === code && !e.message.includes("private-test-secret")
    );
});
test("timeout, network errors and invalid deployment URL are diagnosed safely", async () => {
  await assert.rejects(
    protocol.callGas(gasUrl, upload, {
      fetcher: async () => {
        throw new DOMException("private-test-secret", "TimeoutError");
      },
    }),
    { code: "GAS_TIMEOUT", status: 504 }
  );
  await assert.rejects(
    protocol.callGas(gasUrl, upload, {
      fetcher: async () => {
        throw new Error("private-test-secret");
      },
    }),
    { code: "GAS_NETWORK" }
  );
  for (const url of [
    "https://script.google.com.evil/macros/s/x/exec",
    gasUrl + "?secret=x",
    gasUrl.replace("/exec", "/dev"),
  ])
    await assert.rejects(protocol.callGas(url, upload), {
      code: "EDGE_CONFIG",
    });
});
test("frontend reads the error JSON on HTTP failure", async () => {
  const e = await functionFailure({
    context: Response.json({
      error: "공유 정책 확인",
      code: "GAS_SHARE",
      requestId: "test-request-id",
    }),
  });
  assert.match(e.message, /공유 정책 확인.*GAS_SHARE.*test-request-id/);
  assert.equal(e.code, "GAS_SHARE");
  assert.match(
    (await functionFailure({ context: new Response("HTML") })).message,
    /이미지 서버 요청/
  );
});
test("Drive IDs are accepted only from the expected host", () => {
  assert.equal(driveFileId(protocol.driveUrl(id)), id);
  assert.equal(driveFileId(`https://drive.google.com/file/d/${id}/view`), id);
  assert.equal(driveFileId(`https://evil.invalid/?id=${id}`), null);
  assert.equal(
    driveFileId("https://example.supabase.co/storage/v1/object/public/a/b"),
    null
  );
});

const gasCode = await readFile(
  new URL("../google-apps-script/Code.gs", import.meta.url),
  "utf8"
);
function gasHarness(options = {}) {
  const files = [],
    logs = [];
  const iterator = (array) => {
    let i = 0;
    return { hasNext: () => i < array.length, next: () => array[i++] };
  };
  const categories = [];
  const folder = {
    getId: () => "folder-test",
    getName: () => "private-folder",
    getFoldersByName: (name) => iterator(categories.filter(x=>x.getName()===name)),
    createFolder: (name) => { const child={getId:()=>"category-"+name,getName:()=>name,getParents:()=>iterator([folder]),createFile:(blob)=>folder.createFile(blob)};categories.push(child);return child;},
    getFilesByName: (name) =>
      iterator(files.filter((f) => f.name === name && !f.trashed)),
    createFile: (blob) => {
      if (options.failCreate)
        throw new Error("private provider quota exception");
      const f = {
        name: blob.name,
        id: `drive_file_123456789_${files.length}`,
        description: "",
        trashed: false,
        parent: folder,
        moveTo(parent){this.parent=parent;},
        getId() {
          return this.id;
        },
        getUrl() {
          return `https://drive.google.com/file/d/${this.id}/view`;
        },
        getDescription() {
          return this.description;
        },
        setDescription(v) {
          this.description = v;
        },
        getParents() {return iterator([this.parent]);},
        setSharing() {
          if (options.failShare) throw new Error("private policy detail");
        },
        getBlob: () => ({ getBytes: () => blob.bytes }),
        isTrashed() {
          return this.trashed;
        },
        setTrashed(v) {
          this.trashed = v;
        },
      };
      files.push(f);
      return f;
    },
  };
  const sandbox = {
    console: { info: (x) => logs.push(x), error: (x) => logs.push(x) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ setMimeType: () => text }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) =>
          ({
            SHARED_SECRET: "private-test-secret",
            DRIVE_FOLDER_ID: options.missingFolder ? null : "folder-test",
          }[name]),
      }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 1 },
      Permission: { VIEW: 1 },
      getFolderById: () => {
        if (options.failFolder) throw new Error("private permission");
        return folder;
      },
      getFileById: (id) => files.find((f) => f.id === id),
      getFilesByName: (name) => iterator(files.filter(f=>f.name===name&&!f.trashed)),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        hasLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      base64Decode: (s) => [...Buffer.from(s, "base64")],
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
      DigestAlgorithm: { SHA_256: "SHA256" },
      computeDigest: (_, bytes) => [
        ...createHash("sha256").update(Buffer.from(bytes)).digest(),
      ],
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(gasCode, sandbox);
  const body = {
    ...upload,
    secret: "private-test-secret",
    userId: "user-id-123456789",
    requestId: "request-id-123456789",
    operationId: "operation-id-123456789",
    name: "image.png",
  };
  return {
    files,
    logs,
    options,
    body,
    post: (patch) =>
      JSON.parse(
        sandbox.doPost({
          postData: { contents: JSON.stringify({ ...body, ...patch }) },
        })
      ),
  };
}
test("Apps Script retries reuse the existing file and verify its actual bytes", () => {
  const h = gasHarness();
  const first = h.post({}),
    second = h.post({});
  assert.equal(first.ok, true);
  assert.equal(first.id, second.id);
  assert.equal(h.files.length, 1);
  const stored = h.post({ action: "inspect", id: first.id });
  assert.equal(stored.sha256, hash(Buffer.from(png, "base64")));
  assert.equal(stored.trashed, false);
  assert(!h.logs.join("").includes("private-test-secret"));
});
test("Apps Script config, auth, folder, creation and sharing failures stay separate", () => {
  for (const [options, patch, code] of [
    [{ missingFolder: true }, {}, "GAS_CONFIG"],
    [{}, { secret: "wrong" }, "GAS_AUTH"],
    [{ failFolder: true }, {}, "GAS_FOLDER"],
    [{ failCreate: true }, {}, "GAS_CREATE"],
    [{ failShare: true }, {}, "GAS_SHARE"],
    [
      {},
      { base64: Buffer.from("<html>").toString("base64") },
      "GAS_VALIDATION",
    ],
  ]) {
    const h = gasHarness(options);
    assert.equal(h.post(patch).code, code);
    assert(!h.logs.join("").includes("private"));
  }
});
test("sharing failure is retryable without duplicate creation", () => {
  const h = gasHarness({ failShare: true });
  assert.equal(h.post({}).code, "GAS_SHARE");
  h.options.failShare = false;
  assert.equal(h.post({}).ok, true);
  assert.equal(h.files.length, 1);
});
test("Apps Script blocks a different owner and allows own-file trash", () => {
  const h = gasHarness();
  const result = h.post({});
  assert.equal(
    h.post({ action: "delete", id: result.id, userId: "other-user-123456789" })
      .code,
    "GAS_FORBIDDEN"
  );
  assert.equal(h.files[0].trashed, false);
  assert.equal(h.post({ action: "delete", id: result.id }).ok, true);
  assert.equal(h.files[0].trashed, true);
});

const edgeCode = stripTypeScriptTypes(
  (
    await readFile(
      new URL(
        "../supabase/functions/drive-image-upload/index.ts",
        import.meta.url
      ),
      "utf8"
    )
  ).replace(/^import\s+[^;]+;\r?\n/gm, "")
);
function edgeHarness(options = {}) {
  let handler,
    called = 0,
    adminCalled = 0;
  const settings = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "private-service",
    GAS_SHARED_SECRET: "private-test-secret",
    GAS_WEB_APP_URL: gasUrl,
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.badAuth ? null : { id: "user-id-123456789" } },
        error: null,
      }),
    },
    rpc: async (name) => ({
      data:
        name === "current_session_is_active"
          ? options.active !== false
          : name === "current_user_is_gm"
          ? options.gm !== false
          : name === "player_character_context"
          ? [{ team_id: "own-team", character_id: "own-char" }]
          : options.referenced === true,
      error: options.rpcError ? {} : null,
    }),
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "campaigns" && options.missingCampaign
              ? null
              : { id: "scope-id", is_frozen: options.frozen === true },
            error: null,
          }),
        }),
      }),
    }),
  };
  const sandbox = {
    Deno: {
      env: { get: (name) => settings[name] },
      serve: (fn) => {
        handler = fn;
      },
    },
    console: { info: () => {} },
    crypto: globalThis.crypto,
    Response,
    TextDecoder,
    ...protocol,
    callGas: async () => {
      called++;
      return { ok: true, id, version: protocol.VERSION };
    },
    createClient: (_url, key, opts) => {
      if (key === "private-service") adminCalled++;
      else assert.match(opts.global.headers.Authorization, /Bearer/);
      return client;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(edgeCode, sandbox);
  return {
    settings,
    called: () => called,
    adminCalled: () => adminCalled,
    run: async (
      body = upload,
      authorization = "Bearer valid-user-token",
      method = "POST"
    ) => {
      const response = await handler(
        new Request("https://edge.invalid", {
          method,
          headers: { Authorization: authorization },
          ...(method === "POST"
            ? { body: typeof body === "string" ? body : JSON.stringify(body) }
            : {}),
        })
      );
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
  };
}
test("Edge preflight, authentication, inactive users and bad JSON never reach Drive", async () => {
  assert.equal((await edgeHarness().run({}, "", "OPTIONS")).status, 204);
  for (const [opts, body, token, status] of [
    [{}, upload, "", 401],
    [{ badAuth: true }, upload, "Bearer x", 401],
    [{ active: false }, upload, "Bearer x", 403],
    [{ rpcError: true }, upload, "Bearer x", 500],
    [{}, "{", "Bearer x", 400],
  ]) {
    const h = edgeHarness(opts);
    assert.equal((await h.run(body, token)).status, status);
    assert.equal(h.called(), 0);
  }
});
test("Edge preserves player/team restrictions and validates server-selected GM role", async () => {
  const h = edgeHarness({ gm: false });
  assert.equal(
    (
      await h.run({
        ...upload,
        kind: "gallery",
        isGM: true,
        teamId: "own-team",
      })
    ).status,
    403
  );
  assert.equal(
    (await h.run({ ...upload, kind: "posts", teamId: "other-team" })).status,
    403
  );
  assert.equal(
    (
      await h.run({
        ...upload,
        kind: "token",
        teamId: "own-team",
        characterId: "other-char",
      })
    ).status,
    403
  );
  assert.equal(
    (await h.run({ ...upload, kind: "posts", teamId: "own-team" })).status,
    200
  );
  const frozen = edgeHarness({ gm: false, frozen: true });
  assert.equal(
    (await frozen.run({ ...upload, kind: "posts", teamId: "own-team" })).status,
    403
  );
  assert.equal(
    (
      await edgeHarness({ gm: true, frozen: true }).run({
        ...upload,
        kind: "posts",
        teamId: "own-team",
      })
    ).status,
    200
  );
});
test("NPC images require a server-verified GM and an accessible campaign", async () => {
  const body = { ...upload, kind: "npc", campaignId: "campaign-id" };
  const gm = edgeHarness({ gm: true });
  assert.equal((await gm.run(body)).status, 200);
  assert.equal(gm.called(), 1);
  const player = edgeHarness({ gm: false });
  assert.equal((await player.run({ ...body, isGM: true, teamId: "own-team" })).status, 403);
  assert.equal(player.called(), 0);
  const missing = edgeHarness({ gm: true, missingCampaign: true });
  assert.equal((await missing.run(body)).status, 403);
  assert.equal(missing.called(), 0);
});

test("Edge retains referenced files and calls privileged reference check only on delete", async () => {
  const h = edgeHarness({ referenced: true });
  const result = await h.run({ action: "delete", id });
  assert.equal(result.status, 200);
  assert.equal(result.body.retained, true);
  assert.equal(h.called(), 0);
  assert.equal(h.adminCalled(), 1);
  const uploading = edgeHarness();
  await uploading.run(upload);
  assert.equal(uploading.adminCalled(), 0);
});
test("migration rewrites encoded URLs, arrays, JSON and embedded content without touching unrelated URLs", () => {
  const objects = [
    { bucket_id: "campaign-assets", name: "nested/한 글.png" },
    { bucket_id: "free-board-images", name: "user/posts/post/a.png" },
  ];
  const mapping = Object.fromEntries(
    objects.map((o, i) => [
      `${o.bucket_id}/${o.name}`,
      {
        status: "copied",
        url: `https://drive.google.com/thumbnail?id=${id}${i}`,
      },
    ])
  );
  const lookup = makeLookup(objects, mapping, "https://example.supabase.co");
  const old =
    "https://example.supabase.co/storage/v1/object/sign/campaign-assets/nested/%ED%95%9C%20%EA%B8%80.png?token=old";
  assert.equal(lookup(old), mapping["campaign-assets/nested/한 글.png"].url);
  const actual = rewrite(
    {
      images: ["user/posts/post/a.png"],
      nested: { url: old },
      text: `before ![img](${old}) after`,
      external:
        "https://other.supabase.co/storage/v1/object/public/campaign-assets/a.png",
    },
    lookup
  );
  assert.equal(
    actual.images[0],
    mapping["free-board-images/user/posts/post/a.png"].url
  );
  assert.equal(
    actual.nested.url,
    mapping["campaign-assets/nested/한 글.png"].url
  );
  assert(actual.text.endsWith(") after"));
  assert(actual.external.startsWith("https://other."));
});
test("migration blocks ambiguous paths and missing copies until explicitly resolved", () => {
  const objects = [
    { bucket_id: "post-images", name: "same.png" },
    { bucket_id: "free-board-images", name: "same.png" },
  ];
  const mapping = {
    "post-images/same.png": { status: "copied", url: "drive-a" },
    "free-board-images/same.png": { status: "copied", url: "drive-b" },
  };
  assert.throws(
    () =>
      makeLookup(objects, mapping, "https://example.supabase.co")("same.png"),
    /AMBIGUOUS_PATH/
  );
  assert.equal(
    makeLookup(
      objects,
      mapping,
      "https://example.supabase.co",
      { "posts.image_paths:same.png": "free-board-images/same.png" },
      "posts.image_paths"
    )("same.png"),
    "drive-b"
  );
  assert.throws(
    () =>
      makeLookup(
        objects,
        {},
        "https://example.supabase.co"
      )(
        "https://example.supabase.co/storage/v1/object/public/post-images/same.png"
      ),
    /UNMIGRATED_REFERENCE/
  );
  assert.equal(quote('odd"column'), '"odd""column"');
});
test("migration does not silently skip unsupported images or images with missing MIME metadata", () => {
  assert.equal(
    sourceImageType({ name: "nested/a.PNG", metadata: {} }),
    "image/png"
  );
  assert.equal(
    sourceImageType({
      name: "a.unknown",
      metadata: { mimetype: "image/avif" },
    }),
    "image/avif"
  );
  assert.equal(
    sourceImageType({ name: "log.txt", metadata: { mimetype: "text/plain" } }),
    null
  );
});

const migrationCode = (
  await readFile(
    new URL("../scripts/drive-migration/migrate.mjs", import.meta.url),
    "utf8"
  )
)
  .replace(/^import\s+[^;]+;\r?\n/gm, "")
  .replaceAll("import.meta.url", "moduleUrl");
function migrationHarness(command = "apply", options = {}) {
  const files = new Map(),
    events = [],
    rows = [
      { id: "a", url: "old-a" },
      { id: "b", url: "old-b" },
    ];
  const root = resolve("data/drive-migration");
  const put = (name, value) =>
    files.set(
      join(root, name),
      typeof value === "string" ? value : JSON.stringify(value)
    );
  put("database.json", { tables: [] });
  put("inventory.json", { site: "https://example.supabase.co", objects: [] });
  put("mapping.json", {});
  const mappingSha256 = hash(files.get(join(root, "mapping.json"))),
    databaseSha256 = hash(files.get(join(root, "database.json")));
  put("backup.json", { complete: true, databaseSha256, objects: [] });
  const changes = rows.map((r) => ({
    table: "images",
    key: { id: r.id },
    old: { url: r.url },
    next: { url: "drive-" + r.id },
  }));
  put("plan.json", { databaseSha256, mappingSha256, changes });
  put("file-verification.json", {
    mappingSha256,
    failedImages: options.badFiles ? 1 : 0,
  });
  if (command === "rollback")
    rows.forEach((r) => {
      r.url = "drive-" + r.id;
    });
  if (options.conflict) rows[1].url = "concurrent-edit";
  let before,
    updates = 0;
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async (sql, params = []) => {
      events.push(sql);
      if (sql.startsWith("SELECT id FROM storage.buckets"))
        return { rows: BUCKETS.map((id) => ({ id })) };
      if (sql.startsWith("SELECT id,bucket_id,name")) return { rows: [] };
      if (sql === "BEGIN") {
        before = structuredClone(rows);
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        rows.splice(0, rows.length, ...before);
        return { rows: [] };
      }
      if (
        sql === "COMMIT" ||
        sql.startsWith("SET LOCAL") ||
        sql.startsWith("LOCK TABLE")
      )
        return { rows: [] };
      if (sql.startsWith("SELECT to_jsonb(t)"))
        return {
          rows: rows
            .filter((r) => r.id === params[0])
            .map((row) => ({ row: structuredClone(row) })),
        };
      if (sql.startsWith("UPDATE public.")) {
        updates++;
        if (options.failSecond && updates === 2)
          throw new Error("database write failed");
        assert(events.some((x) => x === "journal-saved"));
        Object.assign(
          rows.find((r) => r.id === params[1]),
          JSON.parse(params[0])
        );
        if (options.trigger)
          rows.find((r) => r.id === params[1]).url = "trigger-rewrite";
        return { rows: [] };
      }
      throw new Error("Unexpected SQL: " + sql);
    },
  };
  const sandbox = {
    moduleUrl: new URL(
      "../scripts/drive-migration/migrate.mjs",
      import.meta.url
    ).href,
    process: {
      argv: ["node", null, command, "--execute"],
      env: {
        MIGRATION_DATABASE_URL: "private-connection",
        SUPABASE_URL: "https://example.supabase.co",
      },
    },
    console: { log: () => {}, error: () => {} },
    Buffer,
    URL,
    JSON,
    Object,
    resolve,
    join,
    pathToFileURL,
    randomUUID,
    isDeepStrictEqual,
    ...protocol,
    BUCKETS,
    hash,
    objectKey,
    quote,
    rewrite,
    makeLookup,
    sourceImageType,
    createRequire: () => () => ({
      Client: class {
        constructor() {
          return client;
        }
      },
    }),
    mkdir: async () => {},
    readFile: async (path) => {
      if (!files.has(path)) {
        const e = new Error("missing");
        e.code = "ENOENT";
        throw e;
      }
      return files.get(path);
    },
    writeFile: async (path, value) => {
      files.set(path, value);
    },
    rename: async (a, b) => {
      files.set(b, files.get(a));
      files.delete(a);
      if (b.endsWith("-journal.json")) events.push("journal-saved");
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(migrationCode + "\nglobalThis.runMigration=main;", sandbox);
  return { rows, events, run: () => sandbox.runMigration(), files };
}
test("migration applies only after journaling and can restore every planned reference", async () => {
  const apply = migrationHarness();
  await apply.run();
  assert.deepEqual(
    apply.rows.map((r) => r.url),
    ["drive-a", "drive-b"]
  );
  assert(apply.events.includes("COMMIT"));
  const rollback = migrationHarness("rollback");
  await rollback.run();
  assert.deepEqual(
    rollback.rows.map((r) => r.url),
    ["old-a", "old-b"]
  );
  assert(rollback.events.includes("COMMIT"));
});
test("migration blocks concurrent edits before any update", async () => {
  const h = migrationHarness("apply", { conflict: true });
  await assert.rejects(h.run(), /DB_CHANGED/);
  assert(!h.events.some((q) => q.startsWith("UPDATE")));
  assert.deepEqual(
    h.rows.map((r) => r.url),
    ["old-a", "concurrent-edit"]
  );
  assert(h.events.includes("ROLLBACK"));
});
test("partial DB failure and trigger rewriting roll back every earlier update", async () => {
  for (const options of [{ failSecond: true }, { trigger: true }]) {
    const h = migrationHarness("apply", options);
    await assert.rejects(h.run());
    assert.deepEqual(
      h.rows.map((r) => r.url),
      ["old-a", "old-b"]
    );
    assert(h.events.includes("ROLLBACK"));
    assert(!h.events.includes("COMMIT"));
  }
});
test("migration blocks DB writes if Drive file verification failed", async () => {
  const h = migrationHarness("apply", { badFiles: true });
  await assert.rejects(h.run(), /DRIVE_FILES_NOT_VERIFIED/);
  assert(!h.events.includes("BEGIN"));
});

test("public originals are classified without changing IDs, retry ownership or delete authorization",()=>{
 for(const [kind,category] of [["token","캐릭터"],["npc","NPC"],["gallery","갤러리"],["posts","게시글"],["comments","댓글"]]){
  const h=gasHarness(),first=h.post({name:"gmcat_"+kind+"__portrait.png"}),again=h.post({name:"gmcat_"+kind+"__portrait.png"});
  assert.equal(first.ok,true);assert.equal(first.id,again.id);assert.equal(h.files.length,1);assert.equal(h.files[0].parent.getName(),category);
  assert.equal(h.post({action:"inspect",id:first.id}).ok,true);assert.equal(h.post({action:"delete",id:first.id,userId:"other-user-123456789"}).code,"GAS_FORBIDDEN");
  assert.equal(h.post({action:"delete",id:first.id}).ok,true);
 }
});
