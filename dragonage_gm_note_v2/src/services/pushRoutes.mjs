// Only internal destinations used by notification payloads survive a login.
export function pushLoginDestination(value) {
  const path = String(value || "");
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  if (
    new RegExp(`^/(?:notices|teams)/${uuid}$`, "i").test(path) ||
    path === "/activity"
  )
    return { path };
  if (path.startsWith("/board/free?postId=")) {
    const id = new URLSearchParams(path.split("?")[1]).get("postId");
    if (new RegExp(`^${uuid}$`, "i").test(id || ""))
      return { path: "/board/free", query: { postId: id } };
  }
  return null;
}
