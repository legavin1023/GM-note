import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = body?.action || "login";
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    if (!username || username.length > 120) {
      return json({ error: "플레이어 아이디를 선택해 주세요." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "로그인 서버 설정이 필요합니다." }, 500);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "status") {
      const { data: configured, error } = await admin.rpc("player_pin_setup_status", {
        p_username: username,
      });
      if (error) {
        console.error("player PIN status lookup failed", error.code);
        return json({ error: "비밀번호 설정 상태를 확인하지 못했습니다." }, 500);
      }
      return json({ configured: configured === true });
    }

    if (action === "setup") {
      const setupCode = body?.setup_code;
      const pin = body?.pin;
      if (
        typeof setupCode !== "string" || !setupCode.trim() ||
        typeof pin !== "string" || !/^\d{4}$/.test(pin)
      ) {
        return json({ error: "설정 코드와 숫자 4자리 PIN을 입력해 주세요." }, 400);
      }
      const { data: initialized, error: setupError } = await admin.rpc(
        "complete_player_pin_setup",
        { p_username: username, p_setup_code: setupCode, p_raw_pin: pin },
      );
      if (setupError) {
        console.error("player PIN setup failed", setupError.code);
        return json({ error: "PIN 설정을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
      }
      if (initialized !== true) {
        return json({ error: "설정 코드가 올바르지 않거나 만료·사용되었습니다. 마스터에게 새 코드를 요청해 주세요." }, 400);
      }
      return await createPlayerSession(admin, username);
    }

    if (action !== "login") return json({ error: "지원하지 않는 요청입니다." }, 400);
    const pin = body?.pin;
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      return json({ error: "숫자 4자리 PIN을 입력해 주세요." }, 400);
    }

    const { data: allowed, error: limitError } = await admin.rpc(
      "player_pin_login_allowed", { p_username: username },
    );
    if (limitError) {
      console.error("player PIN rate limit lookup failed", limitError.code);
      return json({ error: "로그인 상태를 확인하지 못했습니다." }, 500);
    }
    if (allowed !== true) {
      return json({ error: "PIN 입력 횟수를 초과했습니다. 15분 후 다시 시도해 주세요." }, 429);
    }

    const { data: profile, error: profileError } = await admin
      .from("users").select("id, username, team_id")
      .eq("username", username).not("team_id", "is", null).maybeSingle();
    if (profileError) return json({ error: "로그인 정보를 확인하지 못했습니다." }, 500);
    if (!profile) return json({ error: "아이디 또는 PIN이 올바르지 않습니다." }, 401);

    const { data: pinIsValid, error: pinError } = await admin.rpc("verify_user_pin", {
      target_user_id: profile.id, raw_pin: pin,
    });
    if (pinError) {
      console.error("player PIN verification failed", pinError.code);
      return json({ error: "PIN을 확인하지 못했습니다." }, 500);
    }
    if (pinIsValid !== true) {
      await admin.rpc("record_player_pin_login_failure", { p_username: username });
      return json({ error: "아이디 또는 PIN이 올바르지 않습니다." }, 401);
    }

    await admin.rpc("clear_player_pin_login_failures", { p_username: username });
    return await createPlayerSession(admin, username);
  } catch (error) {
    console.error("player login request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "플레이어 로그인 요청을 처리하지 못했습니다." }, 400);
  }
});

async function createPlayerSession(admin: ReturnType<typeof createClient>, username: string) {
  // Read only identity/team fields. PIN and hash values stay inside SQL.
  const { data: profile, error: profileError } = await admin
    .from("users").select("id, username, team_id")
    .eq("username", username).not("team_id", "is", null).maybeSingle();
  if (profileError || !profile) {
    return json({ error: "팀에 연결된 플레이어 계정을 찾을 수 없습니다." }, 404);
  }

  const { data: existingMapping, error: mappingError } = await admin
    .from("player_team_members").select("user_id")
    .eq("login_username", profile.username).maybeSingle();
  if (mappingError) {
    console.error("player identity lookup failed", mappingError.code);
    return json({ error: "플레이어 계정을 확인하지 못했습니다." }, 500);
  }

  let authUserId = existingMapping?.user_id;
  let email: string;
  if (authUserId) {
    const { data: authResult, error: authUserError } =
      await admin.auth.admin.getUserById(authUserId);
    email = authResult.user?.email || "";
    if (authUserError || !email) {
      return json({ error: "플레이어 로그인 계정을 사용할 수 없습니다." }, 500);
    }
  } else {
    email = `player-${profile.id}@players.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, email_confirm: true, password: crypto.randomUUID(),
      user_metadata: { player_user_id: profile.id },
    });
    if (createError || !created.user) {
      console.error("player Auth identity creation failed", createError?.code);
      return json({ error: "플레이어 로그인 계정을 만들지 못했습니다." }, 500);
    }
    authUserId = created.user.id;
    const { error: insertError } = await admin.from("player_team_members").insert({
      user_id: authUserId, login_username: profile.username,
    });
    if (insertError) {
      console.error("player Auth identity mapping failed", insertError.code);
      await admin.auth.admin.deleteUser(authUserId);
      return json({ error: "플레이어 계정을 연결하지 못했습니다." }, 500);
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink", email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("player session link generation failed", linkError?.code);
    return json({ error: "플레이어 로그인 세션을 만들지 못했습니다." }, 500);
  }
  return json({ token_hash: tokenHash });
}
