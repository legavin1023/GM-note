export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function driveFileId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com")
      return null;
    const id =
      url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1] ||
      url.searchParams.get("id");
    return /^[\w-]{10,200}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
export async function functionFailure(error, data) {
  let detail = data;
  if (error?.context && typeof error.context.clone === "function") {
    try {
      detail = await error.context.clone().json();
    } catch {
      /* gateway may return HTML */
    }
  }
  const message =
    typeof detail?.error === "string"
      ? detail.error
      : "이미지 서버 요청에 실패했습니다. 로그인 상태와 서버 배포를 확인하세요.";
  const result = new Error(
    `${message}${detail?.code ? ` [${detail.code}]` : ""}${
      detail?.requestId ? ` (요청 ID: ${detail.requestId})` : ""
    }`
  );
  result.code = detail?.code;
  result.requestId = detail?.requestId;
  return result;
}
