import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  callGas,
  DriveError,
  driveUrl,
  validateUpload,
  VERSION,
} from "./protocol.mjs";

const cors = {
  "Access-Control-Allow-Origin": "https://legavin1023.github.io",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const setting = (key: string) => {
  const value = Deno.env.get(key);
  if (!value)
    throw new DriveError("EDGE_CONFIG", `서버의 ${key} 설정이 없습니다.`, 500);
  return value;
};
function apiKey() {
  const key =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (key) return key;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch {
    /* safe error below */
  }
  throw new DriveError(
    "EDGE_CONFIG",
    "Supabase 공개 API 키 설정을 확인하세요.",
    500
  );
}
Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  let stage = "request";
  const log = (fields: Record<string, unknown>) =>
    console.info(
      JSON.stringify({
        component: "drive-image-upload",
        version: VERSION,
        requestId,
        ...fields,
      })
    );
  const send = (status: number, data: Record<string, unknown>) =>
    Response.json(
      { ...data, requestId, version: VERSION },
      { status, headers: cors }
    );
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return send(405, {
      ok: false,
      code: "METHOD",
      error: "POST 요청만 지원합니다.",
    });
  try {
    stage = "auth";
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token)
      throw new DriveError("AUTH_REQUIRED", "로그인이 필요합니다.", 401);
    const url = setting("SUPABASE_URL");
    const client = createClient(url, apiKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user)
      throw new DriveError(
        "AUTH_INVALID",
        "로그인 정보가 유효하지 않습니다.",
        401
      );
    stage = "permission";
    const active = await client.rpc("current_session_is_active");
    const gm = await client.rpc("current_user_is_gm");
    if (active.error || gm.error)
      throw new DriveError(
        "PERMISSION_CONFIG",
        "기존 로그인 권한 확인 함수를 점검하세요.",
        500
      );
    if (active.data !== true)
      throw new DriveError(
        "INACTIVE",
        "비활성 계정은 이미지를 변경할 수 없습니다.",
        403
      );
    stage = "body";
    const reader = req.body?.getReader();
    if (!reader)
      throw new DriveError("BAD_JSON", "요청 데이터가 없습니다.", 400);
    let raw = "",
      length = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 14 * 1024 * 1024 + 8192) {
        await reader.cancel();
        throw new DriveError(
          "IMAGE_SIZE",
          "이미지는 10MB 이하여야 합니다.",
          413
        );
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DriveError("BAD_JSON", "올바른 JSON 요청이 아닙니다.", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new DriveError("BAD_JSON", "올바른 요청이 아닙니다.", 400);
    const action = body.action || "upload";
    if (!["upload", "delete", "diagnose"].includes(action))
      throw new DriveError("ACTION", "지원하지 않는 작업입니다.", 400);
    if (action === "diagnose" && gm.data !== true)
      throw new DriveError("FORBIDDEN", "GM 권한이 필요합니다.", 403);
    if (action === "upload") {
      validateUpload(body);
      stage = "scope";
      if (gm.data !== true) {
        const context = await client.rpc("player_character_context");
        if (context.error)
          throw new DriveError(
            "PERMISSION_CONFIG",
            "플레이어 권한 확인에 실패했습니다.",
            500
          );
        const own = context.data?.[0];
        if (
          !own ||
          body.teamId !== own.team_id ||
          !["posts", "comments", "token"].includes(body.kind) ||
          (body.kind === "token" && body.characterId !== own.character_id)
        )
          throw new DriveError(
            "FORBIDDEN",
            "해당 팀의 이미지 업로드 권한이 없습니다.",
            403
          );
      }
      if (body.teamId) {
        const team = await client
          .from("teams")
          .select("id,is_frozen")
          .eq("id", body.teamId)
          .maybeSingle();
        if (
          team.error ||
          !team.data ||
          (team.data.is_frozen && gm.data !== true)
        )
          throw new DriveError(
            "FORBIDDEN",
            "팀에 접근할 수 없거나 동결된 팀입니다.",
            403
          );
      }
      if (body.campaignId && gm.data === true) {
        const campaign = await client
          .from("campaigns")
          .select("id")
          .eq("id", body.campaignId)
          .maybeSingle();
        if (campaign.error || !campaign.data)
          throw new DriveError(
            "FORBIDDEN",
            "캠페인에 접근할 수 없습니다.",
            403
          );
      }
    }
    if (action === "delete") {
      if (typeof body.id !== "string" || !/^[\w-]{10,200}$/.test(body.id))
        throw new DriveError("FILE_ID", "올바른 파일 ID가 아닙니다.", 400);
      stage = "references";
      const admin = createClient(url, setting("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
      });
      const referenced = await admin.rpc("drive_image_is_referenced", {
        p_file_id: body.id,
      });
      if (referenced.error)
        throw new DriveError(
          "REFERENCE_CHECK",
          "파일 참조 확인 함수를 적용하세요. 파일은 보존했습니다.",
          500
        );
      if (referenced.data !== false)
        return send(200, { ok: true, retained: true, code: "FILE_REFERENCED" });
    }
    stage = "gas";
    const result = await callGas(
      setting("GAS_WEB_APP_URL"),
      {
        action,
        secret: setting("GAS_SHARED_SECRET"),
        requestId,
        operationId:
          typeof body.operationId === "string" &&
          /^[\w-]{16,100}$/.test(body.operationId)
            ? body.operationId
            : requestId,
        userId: auth.user.id,
        isGM: gm.data === true,
        id: body.id,
        name: String(body.name || "image").slice(0, 100),
        mimeType: body.mimeType,
        base64: body.base64,
      },
      { log }
    );
    log({ stage: "complete", action });
    return send(
      200,
      action === "upload"
        ? {
            ok: true,
            id: result.id,
            url: driveUrl(result.id),
            fileUrl: `https://drive.google.com/file/d/${result.id}/view`,
          }
        : { ...result, ok: true }
    );
  } catch (e) {
    const known = e instanceof DriveError;
    log({ stage, code: known ? e.code : "EDGE_INTERNAL" });
    return send(known ? e.status : 500, {
      ok: false,
      code: known ? e.code : "EDGE_INTERNAL",
      error: known
        ? e.message
        : "서버 내부 처리에 실패했습니다. 요청 ID로 로그를 확인하세요.",
    });
  }
});
