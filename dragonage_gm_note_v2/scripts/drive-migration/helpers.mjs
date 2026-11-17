import { createHash } from "node:crypto";
export const BUCKETS = ["campaign-assets", "post-images", "free-board-images"];
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const objectKey = (o) => `${o.bucket_id}/${o.name}`;
export const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export function sourceImageType(o) {
  const mime = String(o.metadata?.mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) return mime;
  const ext = o.name.split(".").pop().toLowerCase();
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      avif: "image/avif",
      bmp: "image/bmp",
    }[ext] || null
  );
}
export function rewrite(value, lookup) {
  if (typeof value === "string") {
    const exact = lookup(value);
    if (exact) return exact;
    return value.replace(
      /https?:\/\/[^\s"'<>\)\]]+/g,
      (url) => lookup(url) || url
    );
  }
  if (Array.isArray(value)) return value.map((v) => rewrite(v, lookup));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rewrite(v, lookup)])
    );
  return value;
}
export function makeLookup(objects, mapping, site, overrides = {}, scope = "") {
  const origin = new URL(site).origin;
  const byPath = new Map();
  for (const o of objects) {
    const list = byPath.get(o.name) || [];
    list.push(objectKey(o));
    byPath.set(o.name, list);
  }
  return (value) => {
    let candidates = [];
    if (/^https?:\/\//i.test(value)) {
      let url;
      try {
        url = new URL(value);
      } catch {
        return null;
      }
      if (url.origin !== origin) return null;
      const match = url.pathname.match(
        /^\/storage\/v1\/(?:object\/(?:public|sign|authenticated)\/|render\/image\/(?:public|sign|authenticated)\/)([^/]+)\/(.+)$/
      );
      if (!match) return null;
      const bucket = decodeURIComponent(match[1]);
      if (!BUCKETS.includes(bucket)) return null;
      candidates = [`${bucket}/${decodeURIComponent(match[2])}`];
    } else {
      candidates = byPath.get(value) || [];
      if (BUCKETS.some((b) => value.startsWith(b + "/")))
        candidates = [...new Set([...candidates, value])];
    }
    if (!candidates.length) return null;
    if (candidates.length > 1) {
      const selected = overrides[`${scope}:${value}`];
      if (!candidates.includes(selected))
        throw new Error(
          `AMBIGUOUS_PATH in ${scope}; set a bucket-qualified override in overrides.json`
        );
      candidates = [selected];
    }
    const record = mapping[candidates[0]];
    if (!record || record.status !== "copied")
      throw new Error(
        `UNMIGRATED_REFERENCE in ${scope}; finish copy before planning`
      );
    return record.url;
  };
}
