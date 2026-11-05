import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
import {
  validEndpoint,
  notificationPayload,
  deliverSubscriptions,
  wantsNotification,
  commentNotificationPayload,
} from "../supabase/functions/new-post-push/helpers.mjs";

test("team selection and notification kinds are independent per device", () => {
  const post = {
    id: "post",
    team_id: "team-a",
    user_id: "owner",
    content: "작품",
  };
  const subscription = {
    user_id: "owner",
    receive_new_posts: true,
    receive_own_comments: false,
    all_teams: false,
    team_ids: ["team-a"],
    include_master_artwork: false,
  };
  assert.equal(wantsNotification(subscription, post), true);
  assert.equal(
    wantsNotification(subscription, { ...post, team_id: "team-b" }),
    false
  );
  assert.equal(
    wantsNotification(
      { ...subscription, all_teams: true },
      { ...post, team_id: "team-b" }
    ),
    true
  );
  const comment = {
    id: "comment",
    user_id: "other",
    nickname: "친구",
    content: "댓글",
  };
  assert.equal(wantsNotification(subscription, post, comment), false);
  const onlyComments = {
    ...subscription,
    receive_new_posts: false,
    receive_own_comments: true,
  };
  assert.equal(wantsNotification(onlyComments, post), false);
  assert.equal(wantsNotification(onlyComments, post, comment), true);
  assert.equal(
    wantsNotification(
      { ...onlyComments, user_id: "someone-else" },
      post,
      comment
    ),
    false
  );
  assert.equal(
    wantsNotification(onlyComments, post, { ...comment, user_id: "owner" }),
    false
  );
  assert.equal(
    wantsNotification(onlyComments, { ...post, team_id: "team-b" }, comment),
    false
  );
  assert.equal(
    wantsNotification(subscription, {
      ...post,
      team_id: null,
      is_master_artwork: true,
    }),
    false
  );
  assert.equal(
    wantsNotification(
      { ...subscription, include_master_artwork: true },
      { ...post, team_id: null, is_master_artwork: true }
    ),
    true
  );
});

test("multiple comments have independent notification tags and hide spoiler contents", () => {
  const post = { id: "post", content: "원글" };
  const comment = { id: "comment-a", nickname: "친구", content: "반가워요" };
  const payload = commentNotificationPayload(
    post,
    comment,
    "https://example.com/GM-note/"
  );
  assert.equal(payload.kind, "comment");
  assert.equal(payload.eventId, "comment-a");
  assert.equal(payload.body, "친구: 반가워요");
  assert.equal(
    payload.url,
    "https://example.com/GM-note/#/board/free?postId=post"
  );
  assert.notEqual(
    payload.eventId,
    commentNotificationPayload(
      post,
      { ...comment, id: "comment-b" },
      "https://example.com/GM-note/"
    ).eventId
  );
  assert.equal(
    commentNotificationPayload(
      { ...post, is_spoiler: true },
      comment,
      "https://example.com/GM-note/"
    ).body.includes("반가워요"),
    false
  );
});

function edgeHandler(createClient) {
  let handler;
  const source = readFileSync(
    new URL("../supabase/functions/new-post-push/index.ts", import.meta.url),
    "utf8"
  ).replace(/^import[\s\S]*?;\s*/gm, "");
  vm.runInNewContext(stripTypeScriptTypes(source), {
    Deno: {
      env: { get: () => "test-secret" },
      serve: (callback) => {
        handler = callback;
      },
    },
    Response,
    TextEncoder,
    crypto: webcrypto,
    createClient,
    console: { info: () => {}, error: () => {} },
  });
  return handler;
}

test("unauthenticated webhook calls are rejected before database access", async () => {
  const handler = edgeHandler(() => {
    throw Error("must not access DB");
  });
  assert.equal(
    (
      await handler(
        new Request("https://example.com", { method: "POST", body: "{}" })
      )
    ).status,
    401
  );
  assert.equal(
    (await handler(new Request("https://example.com", { method: "GET" })))
      .status,
    405
  );
});

test("authenticated non-board events are rejected before database access", async () => {
  const handler = edgeHandler(() => {
    throw Error("must not access DB");
  });
  const response = await handler(
    new Request("https://example.com", {
      method: "POST",
      headers: { "x-push-webhook-secret": "test-secret" },
      body: JSON.stringify({
        type: "UPDATE",
        schema: "public",
        table: "team_art_posts",
        record: { id: "00000000-0000-0000-0000-000000000001" },
      }),
    })
  );
  assert.equal(response.status, 400);
});

test("team-restricted live DB blocks broadcasts without reading subscriptions", async () => {
  const handler = edgeHandler(() => ({
    rpc: async () => ({ data: false, error: null }),
    from: () => {
      throw Error("must not read table");
    },
  }));
  const response = await handler(
    new Request("https://example.com", {
      method: "POST",
      headers: { "x-push-webhook-secret": "test-secret" },
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "team_art_posts",
        record: { id: "00000000-0000-0000-0000-000000000001" },
      }),
    })
  );
  assert.equal(response.status, 409);
});

test("only standard HTTPS push providers are allowed, no credentials/ports/lookalike hosts", () => {
  for (const value of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2.notify.windows.com/abc",
  ])
    assert.equal(validEndpoint(value), true);
  for (const value of [
    "http://fcm.googleapis.com/a",
    "https://fcm.googleapis.com.evil.example/a",
    "https://127.0.0.1/a",
    "https://push.apple.com.evil.example/a",
    "https://user:password@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:8080/a",
    "invalid",
  ])
    assert.equal(validEndpoint(value), false);
});

test("real board hash route, first-line title, image fallback and spoiler protection", () => {
  const result = notificationPayload(
    { id: "abc", content: "\n제목\n내용" },
    "https://example.com/GM-note/"
  );
  assert.equal(
    result.url,
    "https://example.com/GM-note/#/board/free?postId=abc"
  );
  assert.equal(result.body, "제목");
  assert.equal(
    notificationPayload(
      { id: "a", image_paths: ["x"] },
      "https://example.com/GM-note/"
    ).body,
    "이미지 작품 게시글"
  );
  assert.equal(
    notificationPayload(
      { id: "a", content: "비밀", is_spoiler: true },
      "https://example.com/GM-note/"
    ).body.includes("비밀"),
    false
  );
  assert.throws(() =>
    notificationPayload({ id: "a" }, "https://example.com/GM-note")
  );
});

test("a failure does not stop other subscribers; expire only 404/410, skip receipts", async () => {
  const removed = [],
    sent = [],
    released = [];
  const rows = [201, 404, 410, 429, 500, "throw", "skip"].map((id) => ({
    id,
    endpoint: "https://fcm.googleapis.com/a",
  }));
  const result = await deliverSubscriptions(rows, {
    claim: async (row) => row.id !== "skip",
    send: async (row) => {
      if (row.id === "throw") throw Error("network");
      return row.id;
    },
    remove: async (row) => removed.push(row.id),
    receipt: async (row) => sent.push(row.id),
    release: async (row) => released.push(row.id),
  });
  assert.deepEqual(result, { sent: 1, expired: 2, failed: 3, skipped: 1 });
  assert.deepEqual(removed.sort(), [404, 410]);
  assert.deepEqual(sent, [201]);
  assert.equal(released.length, 3);
});

test("failed claims do not release another worker's lease", async () => {
  let releases = 0;
  await deliverSubscriptions([{ endpoint: "https://fcm.googleapis.com/a" }], {
    claim: async () => {
      throw Error("database");
    },
    release: async () => {
      releases++;
    },
  });
  assert.equal(releases, 0);
});

function worker(clients) {
  const handlers = {},
    notifications = [];
  vm.runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      self: {
        registration: {
          scope: "https://example.com/GM-note/",
          showNotification: async (...args) => notifications.push(args),
        },
        clients,
        addEventListener: (name, handler) => {
          handlers[name] = handler;
        },
        skipWaiting: () => {},
      },
    }
  );
  return { handlers, notifications };
}

test("push always shows a notification, including malformed payloads", async () => {
  const { handlers, notifications } = worker({});
  let pending;
  handlers.push({
    data: {
      json: () => {
        throw Error("bad json");
      },
    },
    waitUntil: (value) => {
      pending = value;
    },
  });
  await pending;
  assert.equal(notifications.length, 1);
  assert.equal(
    notifications[0][1].icon,
    "https://example.com/GM-note/icons/icon-192.png"
  );
});

test("notification click focuses/navigates existing window and blocks foreign URLs", async () => {
  const navigations = [],
    opened = [];
  let focuses = 0,
    pending;
  const client = {
    url: "https://example.com/GM-note/#/home",
    navigate: async (url) => {
      navigations.push(url);
      return {
        focus: async () => {
          focuses++;
        },
      };
    },
  };
  const { handlers } = worker({
    matchAll: async () => [client],
    openWindow: async (url) => opened.push(url),
  });
  const click = async (url) => {
    handlers.notificationclick({
      notification: { close: () => {}, data: { url } },
      waitUntil: (value) => {
        pending = value;
      },
    });
    await pending;
  };
  await click("https://example.com/GM-note/#/board/free?postId=abc");
  await click("https://evil.example/");
  assert.equal(focuses, 2);
  assert.equal(opened.length, 0);
  assert.equal(navigations[1], "https://example.com/GM-note/");
});

test("notification click opens a window if app is closed", async () => {
  const opened = [];
  let pending;
  const { handlers } = worker({
    matchAll: async () => [],
    openWindow: async (url) => opened.push(url),
  });
  handlers.notificationclick({
    notification: {
      close: () => {},
      data: { url: "https://example.com/GM-note/#/board/free?postId=a" },
    },
    waitUntil: (value) => {
      pending = value;
    },
  });
  await pending;
  assert.equal(opened[0], "https://example.com/GM-note/#/board/free?postId=a");
});

test("worker displays independent comment notifications for the same post", async () => {
  const { handlers, notifications } = worker({});
  for (const eventId of ["comment-a", "comment-b"]) {
    let pending;
    handlers.push({
      data: {
        json: () => ({
          kind: "comment",
          eventId,
          postId: "post",
          body: "친구: 댓글",
        }),
      },
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;
  }
  assert.equal(notifications[0][0], "💬 내 글에 댓글이 달렸어요");
  assert.notEqual(notifications[0][1].tag, notifications[1][1].tag);
});
