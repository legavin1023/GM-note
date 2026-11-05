/** Return only the player-facing portion of a slash-delimited description. */
export function getPlayerVisibleDescription(description) {
  const value = String(description || "");
  const slashIndex = value.indexOf("/");
  return slashIndex < 0 ? "" : value.slice(slashIndex + 1).trim();
}
