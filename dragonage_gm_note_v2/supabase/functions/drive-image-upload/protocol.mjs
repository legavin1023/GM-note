export const MAX_BYTES = 10 * 1024 * 1024;
export const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VERSION = "gm-drive-2026-11-11";
export class DriveError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function validateUpload(body) {
  if (!TYPES.includes(body?.mimeType))
    throw new DriveError(
      "INVALID_TYPE",
      "JPG, PNG, WebP, GIF만 업로드 가능합니다.",
      400
    );
  const s = body.base64;
  if (typeof s !== "string" || s.length > Math.ceil(MAX_BYTES / 3) * 4)
    throw new DriveError("IMAGE_SIZE", "이미지는 10MB 이하여야 합니다.", 413);
  if (!s.length || s.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s))
    throw new DriveError(
      "INVALID_BASE64",
      "이미지 데이터가 올바르지 않습니다.",
      400
    );
  const size =
    (s.length / 4) * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
  if (size <= 0 || size > MAX_BYTES)
    throw new DriveError("IMAGE_SIZE", "이미지는 10MB 이하여야 합니다.", 413);
  return size;
}
const messages = {
  BACKUP_CONFIG:
    "Apps Script 백업 속성과 setupGoogleBackup 실행 상태를 확인하세요.",
  BACKUP_AUTH: "백업 전용 공유 비밀값이 일치하지 않습니다.",
  BACKUP_PRIVATE: "백업 폴더와 시트가 비공개인지 확인하세요.",
  BACKUP_LOCK: "다른 백업 작업이 처리 중입니다. 자동 재시도합니다.",
  BACKUP_ASSET_MISSING:
    "원본 첨부파일을 읽지 못했습니다. 이벤트는 보존하며 재시도합니다.",
  BACKUP_WRITE:
    "Google 백업 기록 중 오류가 발생했습니다. 원본 이벤트는 보존됩니다.",
  BACKUP_FORMAT: "백업 요청 형식이 올바르지 않습니다.",
  BACKUP_CHECKSUM: "Google 백업 파일의 체크섬이 일치하지 않습니다.",
  GAS_CONFIG:
    "Apps Script의 SHARED_SECRET 또는 DRIVE_FOLDER_ID 설정이 없습니다.",
  GAS_AUTH: "Edge Function과 Apps Script의 공유 비밀값이 일치하지 않습니다.",
  GAS_FOLDER: "Apps Script 실행 계정이 대상 Drive 폴더에 접근하지 못했습니다.",
  GAS_CREATE:
    "Drive 파일 생성에 실패했습니다. 실행 계정의 권한과 저장 용량을 확인하세요.",
  GAS_SHARE:
    "Drive 파일의 공개 링크 설정에 실패했습니다. 계정의 공유 정책을 확인하세요.",
  GAS_FORBIDDEN: "이 Drive 파일을 삭제할 권한이 없습니다.",
  GAS_DELETE: "Drive 파일을 휴지통으로 이동하지 못했습니다.",
  GAS_VALIDATION: "Apps Script가 이미지 요청을 거부했습니다.",
  GAS_INTERNAL:
    "Apps Script 처리에 실패했습니다. 요청 ID로 실행 로그를 확인하세요.",
};
export function driveUrl(id) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
    id
  )}&sz=w1600`;
}
export async function callGas(
  url,
  payload,
  { fetcher = fetch, timeout = 55000, log = (_fields) => {} } = {}
) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new DriveError(
      "EDGE_CONFIG",
      "GAS_WEB_APP_URL 설정을 확인하세요.",
      500
    );
  }
  if (
    target.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[\w-]+\/exec$/.test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw new DriveError(
      "EDGE_CONFIG",
      "GAS_WEB_APP_URL은 배포된 /exec 주소여야 합니다.",
      500
    );
  try {
    const signal = AbortSignal.timeout(timeout);
    let response = await fetcher(target.href, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal,
    });
    log({ stage: "gas_post", upstreamStatus: response.status });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      const next = location ? new URL(location, target) : null;
      await response.body?.cancel();
      // ContentService returns a one-time GET URL. Never replay secrets/images.
      if (
        ![302, 303].includes(response.status) ||
        next?.origin !== "https://script.googleusercontent.com" ||
        !next.pathname.startsWith("/macros/")
      )
        throw new DriveError(
          "GAS_REDIRECT",
          "Apps Script의 웹 앱 접근 권한 또는 리디렉션 주소를 확인하세요."
        );
      response = await fetcher(next.href, {
        method: "GET",
        redirect: "error",
        signal,
      });
      log({ stage: "gas_content", upstreamStatus: response.status });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DriveError(
        "GAS_HTTP",
        `Apps Script 응답 오류 (HTTP ${response.status}). 배포 상태를 확인하세요.`
      );
    }
    const reader = response.body.getReader();
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) {
        await reader.cancel();
        throw new DriveError(
          "GAS_NOT_JSON",
          "Apps Script 응답이 JSON 범위를 벗어났습니다. 웹 앱 접근 권한을 확인하세요."
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new DriveError(
        "GAS_NOT_JSON",
        "Apps Script가 JSON을 반환하지 않았습니다. 실행 계정과 웹 앱 접근 권한을 확인하세요."
      );
    }
    if (result?.ok !== true) {
      let code = Object.hasOwn(messages, result?.code)
        ? result.code
        : "GAS_INTERNAL";
      if (!result?.code && /인증 실패/.test(String(result?.error)))
        code = "GAS_AUTH";
      log({ stage: "gas_rejected", code });
      throw new DriveError(
        code,
        messages[code],
        code === "GAS_FORBIDDEN" ? 403 : 502
      );
    }
    if (result.version !== VERSION)
      throw new DriveError(
        "GAS_VERSION",
        "Apps Script의 기존 배포를 새 코드 버전으로 업데이트하세요."
      );
    if (
      payload.action === "upload" &&
      (typeof result.id !== "string" || !/^[\w-]{10,200}$/.test(result.id))
    )
      throw new DriveError(
        "GAS_PROTOCOL",
        "Drive 파일 ID가 올바르지 않습니다."
      );
    return result;
  } catch (e) {
    if (e instanceof DriveError) throw e;
    if (["TimeoutError", "AbortError"].includes(e?.name))
      throw new DriveError(
        "GAS_TIMEOUT",
        "Drive 응답 시간이 초과되었습니다. 같은 요청 ID로 재시도하세요.",
        504
      );
    throw new DriveError(
      "GAS_NETWORK",
      "Apps Script 호출 또는 응답 수신에 실패했습니다. 요청 ID로 로그를 확인하세요."
    );
  }
}
