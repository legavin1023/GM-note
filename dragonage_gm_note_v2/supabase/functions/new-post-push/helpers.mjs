export function validEndpoint(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

export function notificationPayload(post, siteUrl) {
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("PUSH_SITE_URL must use HTTPS");
  if (base.search || base.hash || !base.pathname.endsWith("/"))
    throw new Error(
      "PUSH_SITE_URL must be the app base URL ending in /, without a query/hash"
    );
  const firstLine = String(post.content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  // Preserve spoiler masking already used by the board UI.
  const body = post.is_spoiler
    ? "스포일러 작품 글이 등록되었습니다."
    : firstLine?.slice(0, 240) ||
      (post.image_paths?.length ? "이미지 작품 게시글" : "새 작품 게시글");
  base.hash = `/board/free?postId=${encodeURIComponent(post.id)}`;
  return {
    kind: "post",
    eventId: post.id,
    title: "🔔 새 게시글이 올라왔어요",
    body,
    postId: post.id,
    url: base.href,
  };
}

export function wantsNotification(subscription, post, comment = null) {
  if (comment) {
    if (
      !subscription.receive_own_comments ||
      subscription.user_id !== post.user_id ||
      comment.user_id === post.user_id
    )
      return false;
  } else if (subscription.receive_new_posts === false) return false;
  if (subscription.all_teams !== false) return true;
  return post.is_master_artwork
    ? Boolean(subscription.include_master_artwork)
    : (subscription.team_ids || []).includes(post.team_id);
}

export function commentNotificationPayload(post, comment, siteUrl) {
  const payload = notificationPayload(post, siteUrl);
  const firstLine = String(comment.content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return {
    ...payload,
    kind: "comment",
    eventId: comment.id,
    title: "💬 내 글에 댓글이 달렸어요",
    body: post.is_spoiler
      ? "내 스포일러 글에 새 댓글이 달렸습니다."
      : `${comment.nickname || "작성자"}: ${
          firstLine || (comment.image_path ? "이미지 댓글" : "새 댓글")
        }`.slice(0, 240),
  };
}

export async function deliverSubscriptions(rows, operations) {
  const counts = { sent: 0, expired: 0, failed: 0, skipped: 0 };
  let next = 0;
  const run = async () => {
    while (next < rows.length) {
      const row = rows[next++];
      let claimed = false;
      try {
        if (!validEndpoint(row.endpoint)) {
          counts.failed++;
          continue;
        }
        if (!(await operations.claim(row))) {
          counts.skipped++;
          continue;
        }
        claimed = true;
        const status = await operations.send(row);
        if (status === 404 || status === 410) {
          await operations.remove(row);
          counts.expired++;
        } else if (status >= 200 && status < 300) {
          await operations.receipt(row);
          counts.sent++;
        } else {
          await operations.release(row);
          counts.failed++;
        }
      } catch {
        // One broken subscription must not abort the other recipients.
        if (claimed) await operations.release(row).catch(() => {});
        counts.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, run));
  return counts;
}
