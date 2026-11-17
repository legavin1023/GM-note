export const BACKUP_VERSION = "gm-backup-2026-11-11";
const sensitive =
  /password|passwd|(?:^|_)pin(?:_|$)|access_token|refresh_token|api_key|private_key|shared_secret|webhook_secret|service_role|confirmation_token|recovery_token|^(auth|p256dh|endpoint)$/i;
export function sheetSafe(value) {
  if (Array.isArray(value)) return value.map(sheetSafe);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        sensitive.test(k) ? "[암호화 백업에 보관]" : sheetSafe(v),
      ])
    );
  return value;
}
export function discoverAssets(event, site) {
  const assets = new Map(),
    origin = new URL(site).origin;
  const add = (asset) => assets.set(asset.key, asset);
  const visit = (value, field = "") => {
    if (Array.isArray(value)) {
      for (const v of value) visit(v, field);
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
      return;
    }
    if (typeof value !== "string" || !value) return;
    const urls = value.match(/https?:\/\/[^\s"'<>\)\]]+/g) || [];
    for (const raw of urls) {
      let u;
      try {
        u = new URL(raw);
      } catch {
        continue;
      }
      if (u.protocol !== "https:") continue;
      if (u.hostname === "drive.google.com") {
        const id =
          u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ||
          u.searchParams.get("id");
        if (/^[\w-]{10,200}$/.test(id || ""))
          add({ key: `drive/${id}`, type: "drive", id });
      }
      if (u.origin === origin) {
        const match = u.pathname.match(
          /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
        );
        if (match) {
          const bucket = decodeURIComponent(match[1]),
            path = decodeURIComponent(match[2]);
          add({
            key: `storage/${bucket}/${path}`,
            type: "storage",
            bucket,
            path,
          });
        }
      }
    }
    if (
      !/^https?:/i.test(value) &&
      ["image_path", "image_paths"].includes(field)
    )
      add({ key: `legacy/${value}`, type: "legacy", path: value });
    if (!/^https?:/i.test(value) && field === "storage_path")
      add({
        key: `storage/team-log-backups/${value}`,
        type: "storage",
        bucket: "team-log-backups",
        path: value,
      });
  };
  visit(event.payload.before);
  visit(event.payload.after);
  if (event.payload.schema === "storage" && event.payload.table === "objects") {
    const o = event.payload.after || event.payload.before;
    if (o?.bucket_id && o?.name)
      add({
        key: `storage/${o.bucket_id}/${o.name}`,
        type: "storage",
        bucket: o.bucket_id,
        path: o.name,
        revision: o.updated_at || o.created_at || "",
      });
  }
  return [...assets.values()];
}
function decode(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export async function encryptEvent(event, base64Key) {
  const bytes = decode(base64Key);
  if (bytes.length !== 32) throw new Error("BACKUP_KEY_INVALID");
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`GM-note:backup:v1:${event.eventId}`);
  const clear = new TextEncoder().encode(JSON.stringify(event));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      clear
    )
  );
  return {
    format: "gm-note-event-v1",
    eventId: event.eventId,
    iv: encode(iv),
    ciphertext: encode(encrypted),
  };
}
export async function decryptEvent(envelope, base64Key) {
  if (envelope?.format !== "gm-note-event-v1")
    throw new Error("BACKUP_FORMAT_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    decode(base64Key),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const aad = new TextEncoder().encode(`GM-note:backup:v1:${envelope.eventId}`);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(envelope.iv), additionalData: aad },
    key,
    decode(envelope.ciphertext)
  );
  const event = JSON.parse(new TextDecoder().decode(clear));
  if (event.eventId !== envelope.eventId)
    throw new Error("BACKUP_EVENT_MISMATCH");
  return event;
}
export async function secretMatches(a, b) {
  const digest = async (s) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return x.reduce((diff, v, i) => diff | (v ^ y[i]), 0) === 0;
}
export async function verifyWebhook(headers, secret, now = Date.now()) {
  const stamp = headers.get("x-backup-timestamp") || "",
    nonce = headers.get("x-backup-nonce") || "",
    signature = headers.get("x-backup-signature") || "";
  if (
    !/^\d{10}$/.test(stamp) ||
    !/^[\w-]{36}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Math.abs(now / 1000 - Number(stamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(stamp + "." + nonce)
    )
  );
  const expected = [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return secretMatches(expected, signature);
}
