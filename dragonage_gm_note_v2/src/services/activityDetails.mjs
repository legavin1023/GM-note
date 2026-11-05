export function activityDetailLines(log) {
  if (!Array.isArray(log.details)) return [];
  return log.details
    .filter((item) => item && typeof item.label === "string")
    .map((item) => {
      const before = item.before ?? "없음";
      const after = item.after ?? "없음";
      if (log.operation === "UPDATE")
        return `${item.label}: ${before} → ${after}`;
      return `${item.label}: ${log.operation === "DELETE" ? before : after}`;
    });
}

export function activityPreview(log) {
  const operation =
    { INSERT: "등록", UPDATE: "수정", DELETE: "삭제" }[log.operation] || "변경";
  const lines = activityDetailLines(log);
  return [
    log.feature + " " + operation,
    log.entity_label,
    lines.slice(0, 2).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");
}
