import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";
import {
  deliverSubscriptions,
  notificationPayload,
  commentNotificationPayload,
  wantsNotification,
} from "./helpers.mjs";

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
async function authorized(value: string | null, secret: string) {
  const digest = async (input: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
    );
  const [a, b] = await Promise.all([digest(value || ""), digest(secret)]);
  return (
    a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) ===
    0
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  try {
    // verify_jwt is disabled ONLY because this is a DB webhook, not a browser API.
    // A dedicated secret still authenticates every request before any database access.
    if (
      !(await authorized(
        request.headers.get("x-push-webhook-secret"),
        required("PUSH_WEBHOOK_SECRET")
      ))
    )
      return json({ error: "Unauthorized" }, 401);
    let event;
    try {
      event = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (
      event?.type !== "INSERT" ||
      event?.schema !== "public" ||
      !["team_art_posts", "team_art_comments"].includes(event?.table) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        event?.record?.id || ""
      )
    )
      return json({ error: "Invalid board INSERT event" }, 400);

    const isComment = event.table === "team_art_comments";
    const eventType = isComment ? "comment" : "post";

    const admin = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
    const { data: shared, error: policyError } = await admin.rpc(
      "push_board_is_shared"
    );
    if (policyError) throw policyError;
    if (!shared)
      return json(
        {
          error:
            "Board is not shared with all authenticated users; push stopped to protect access permissions",
        },
        409
      );
    let comment = null;
    if (isComment) {
      const policy = await admin.rpc("push_comments_are_shared");
      if (policy.error) throw policy.error;
      if (!policy.data)
        return json(
          {
            error:
              "Comment read policy is restricted; push stopped to protect access permissions",
          },
          409
        );
      const result = await admin
        .from("team_art_comments")
        .select("id,post_id,user_id,nickname,content,image_path")
        .eq("id", event.record.id)
        .maybeSingle();
      if (result.error) throw result.error;
      comment = result.data;
      if (!comment) return json({ skipped: "Comment no longer exists" });
    }
    // Re-read real columns. Never trust webhook text/URLs and don't notify deleted posts.
    const { data: post, error } = await admin
      .from("team_art_posts")
      .select(
        "id,user_id,team_id,is_master_artwork,content,image_paths,is_spoiler,created_at"
      )
      .eq("id", comment ? comment.post_id : event.record.id)
      .maybeSingle();
    if (error) throw error;
    if (!post) return json({ skipped: "Post no longer exists" });
    // Frozen team content is not public to players: do not broadcast it.
    if (post.team_id) {
      const team = await admin.from("teams").select("is_frozen").eq("id", post.team_id).maybeSingle();
      if (team.error) throw team.error;
      if (!team.data || team.data.is_frozen) return json({ skipped: "Frozen team" });
    }
    if (comment && comment.user_id === post.user_id)
      return json({ skipped: "Self comment" });
    const payload = JSON.stringify(
      comment
        ? commentNotificationPayload(post, comment, required("PUSH_SITE_URL"))
        : notificationPayload(post, required("PUSH_SITE_URL"))
    );
    const vapidDetails = {
      subject: required("VAPID_SUBJECT"),
      publicKey: required("VAPID_PUBLIC_KEY"),
      privateKey: required("VAPID_PRIVATE_KEY"),
    };
    const totals = { sent: 0, expired: 0, failed: 0, skipped: 0 };
    let cursor = "";
    const started = Date.now();
    while (true) {
      if (Date.now() - started > 95000)
        return json(
          {
            ...totals,
            error:
              "Time budget reached; replay event to resume unsent deliveries",
          },
          503
        );
      let query = admin
        .from("push_subscriptions")
        .select(
          "id,user_id,endpoint,p256dh,auth,receive_new_posts,receive_own_comments,all_teams,team_ids,include_master_artwork"
        )
        .eq(isComment ? "receive_own_comments" : "receive_new_posts", true)
        .order("id")
        .limit(20);
      if (cursor) query = query.gt("id", cursor);
      if (isComment) query = query.eq("user_id", post.user_id);
      const { data: rows, error: subscriptionError } = await query;
      if (subscriptionError) throw subscriptionError;
      if (!rows?.length) break;
      const check = async (operation: PromiseLike<{ error: unknown }>) => {
        const result = await operation;
        if (result.error) throw result.error;
      };
      const eligible = rows.filter((row) =>
        wantsNotification(row, post, comment)
      );
      totals.skipped += rows.length - eligible.length;
      const counts = await deliverSubscriptions(eligible, {
        claim: async (row: { id: string }) => {
          const result = await admin.rpc("claim_push_event", {
            p_event_type: eventType,
            p_event_id: event.record.id,
            p_post_id: post.id,
            p_subscription_id: row.id,
          });
          if (result.error) throw result.error;
          return result.data;
        },
        send: async (row: {
          endpoint: string;
          p256dh: string;
          auth: string;
        }) => {
          const details = webpush.generateRequestDetails(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            payload,
            {
              vapidDetails,
              TTL: 86400,
              urgency: "normal",
            }
          );
          // Known push hosts only; redirects disabled to prevent endpoint-based SSRF.
          const response = await fetch(details.endpoint, {
            method: "POST",
            headers: details.headers,
            body: new Uint8Array(details.body),
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          await response.body?.cancel();
          return response.status;
        },
        remove: (row: { id: string }) =>
          check(admin.from("push_subscriptions").delete().eq("id", row.id)),
        receipt: (row: { id: string }) =>
          check(
            admin
              .from("push_event_deliveries")
              .update({ sent_at: new Date().toISOString() })
              .eq("post_id", post.id)
              .eq("event_type", eventType)
              .eq("event_id", event.record.id)
              .eq("subscription_id", row.id)
          ),
        release: (row: { id: string }) =>
          check(
            admin
              .from("push_event_deliveries")
              .delete()
              .eq("post_id", post.id)
              .eq("event_type", eventType)
              .eq("event_id", event.record.id)
              .eq("subscription_id", row.id)
              .is("sent_at", null)
          ),
      });
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += counts[key];
      cursor = rows[rows.length - 1].id;
      if (rows.length < 20) break;
    }
    console.info("Web push delivery", {
      eventType,
      eventId: event.record.id,
      postId: post.id,
      ...totals,
    });
    return json(totals, totals.failed ? 503 : 200);
  } catch {
    // No endpoints, keys, content or raw upstream errors in logs or responses.
    console.error(
      "Web push failed; check server secrets, SQL migration and function configuration"
    );
    return json(
      { error: "Push delivery failed; check function configuration" },
      500
    );
  }
});
