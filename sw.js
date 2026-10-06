/* eslint-env serviceworker */
// Network-only: never cache authenticated pages, Supabase responses or artwork.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (_) {
    /* still show a notification */
  }
  const base = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(
      payload.kind === "comment"
        ? "💬 내 글에 댓글이 달렸어요"
        : "🔔 새 게시글이 올라왔어요",
      {
        body: String(payload.body || "새 작품 게시글").slice(0, 240),
        icon: new URL("icons/icon-192.png", base).href,
        badge: new URL("icons/icon-192.png", base).href,
        tag: payload.eventId
          ? `${payload.kind === "comment" ? "comment" : "post"}-${
              payload.eventId
            }`
          : payload.postId
          ? `post-${payload.postId}`
          : "new-post",
        data: { url: payload.url || base },
      }
    )
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = new URL(self.registration.scope);
      let target;
      try {
        target = new URL(event.notification.data?.url || scope.href, scope);
      } catch (_) {
        target = scope;
      }
      if (
        target.origin !== scope.origin ||
        !target.pathname.startsWith(scope.pathname)
      )
        target = scope;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        const current = new URL(client.url);
        if (
          current.origin === scope.origin &&
          current.pathname.startsWith(scope.pathname)
        ) {
          try {
            const navigated = await client.navigate(target.href);
            if (navigated) {
              await navigated.focus();
              return;
            }
          } catch (_) {
            /* fall back to opening a window */
          }
        }
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
