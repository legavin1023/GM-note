import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { callGas } from "../drive-image-upload/protocol.mjs";
import {
  BACKUP_VERSION,
  sheetSafe,
  discoverAssets,
  encryptEvent,
  verifyWebhook,
} from "./helpers.mjs";
// Visible once at worker startup to distinguish this deployment from old logs.
console.info(
  JSON.stringify({
    component: "google-backup",
    stage: "boot",
    build: "google-backup-20261111-r3",
  })
);
const required = (key: string) => {
  const v = Deno.env.get(key);
  if (!v) throw new Error("BACKUP_CONFIG");
  return v;
};
Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const send = (status: number, body: Record<string, unknown>) =>
    Response.json({ ...body, requestId, version: BACKUP_VERSION }, { status });
  if (req.method !== "POST") return send(405, { ok: false, code: "METHOD" });
  let client: any,
    claim: any,
    results: any[] = [];
  try {
    // This endpoint is called ONLY by the database worker, never the browser.
    if (
      !(await verifyWebhook(
        req.headers,
        required("GOOGLE_BACKUP_WEBHOOK_SECRET")
      ))
    )
      return send(401, { ok: false, code: "UNAUTHORIZED" });
    const body = await req.json().catch(() => null);
    if (body?.action !== "drain")
      return send(400, { ok: false, code: "ACTION" });
    const site = required("SUPABASE_URL"),
      gasUrl = required("GAS_WEB_APP_URL");
    const secret = required("GAS_BACKUP_SHARED_SECRET"),
      key = required("GOOGLE_BACKUP_ENCRYPTION_KEY");
    client = createClient(site, required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const claimed = await client.rpc("claim_google_backup");
    if (claimed.error) throw new Error("BACKUP_CLAIM");
    claim = claimed.data;
    if (!claim) return send(200, { ok: true, processed: 0 });
    for (const event of claim.events) {
      try {
        const assets = [];
        for (const asset of discoverAssets(event, site)) {
          if (asset.type === "drive") {
            assets.push(asset);
            continue;
          }
          let selected: any = null;
          const buckets =
            asset.type === "legacy"
              ? ["free-board-images", "post-images"]
              : [asset.bucket];
          for (const bucket of buckets) {
            const signed = await client.storage
              .from(bucket)
              .createSignedUrl(asset.path, 600);
            if (!signed.error && signed.data?.signedUrl) {
              selected = {
                ...asset,
                type: "storage",
                key: `storage/${bucket}/${asset.path}`,
                bucket,
                downloadUrl: signed.data.signedUrl,
              };
              break;
            }
          }
          // GAS can reuse an existing backup if the source has since been removed.
          assets.push(selected || { ...asset, downloadUrl: null });
        }
        const encrypted = await encryptEvent(event, key);
        const safePayload = {
          ...event.payload,
          before:
            event.payload.schema === "auth"
              ? null
              : sheetSafe(event.payload.before),
          after:
            event.payload.schema === "auth"
              ? null
              : sheetSafe(event.payload.after),
        };
        const response = await callGas(gasUrl, {
          action: "backupEvent",
          secret,
          requestId,
          event: { ...event, payload: safePayload },
          encrypted,
          assets,
          storageOrigin: new URL(site).origin,
        });
        if (
          response.backupVersion !== BACKUP_VERSION ||
          response.eventId !== event.eventId
        )
          throw new Error("BACKUP_RECEIPT");
        results.push({ eventId: event.eventId, ok: true });
      } catch (e) {
        const code =
          e instanceof Error &&
          /^[A-Z_]{1,80}$/.test((e as any).code || e.message)
            ? (e as any).code || e.message
            : "BACKUP_DELIVERY";
        console.error(
          JSON.stringify({ requestId, eventId: event.eventId, code })
        );
        results.push({ eventId: event.eventId, ok: false, code });
      }
    }
    const finished = await client.rpc("finish_google_backup", {
      p_token: claim.token,
      p_results: results,
    });
    if (finished.error) throw new Error("BACKUP_ACK");
    const failed = results.filter((r) => !r.ok).length;
    // Continue successful backfill immediately; leave total failures to cron.
    // Otherwise one configuration error rapidly drains the entire queue in a loop.
    if (results.some((r) => r.ok)) await client.rpc("request_google_backup");
    console.info(
      JSON.stringify({ requestId, processed: results.length, failed })
    );
    return send(failed ? 503 : 200, {
      ok: failed === 0,
      processed: results.length,
      failed,
    });
  } catch (e) {
    // Leave claimed events pending; lease expiry makes transport failures retryable.
    const code =
      e instanceof Error && /^[A-Z_]{1,80}$/.test(e.message)
        ? e.message
        : "BACKUP_INTERNAL";
    console.error(JSON.stringify({ requestId, code }));
    return send(500, { ok: false, code });
  }
});
