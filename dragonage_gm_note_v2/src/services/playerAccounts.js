import { supabase } from "@/supabase";

export async function getPlayerLoginUsernames() {
  const { data, error } = await supabase.rpc("list_player_login_usernames");
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.username).filter(Boolean))];
}

export async function signInPlayer(username, pin) {
  const data = await invokePlayerLogin({ action: "login", username, pin });
  await establishPlayerSession(data);
}

export async function getPlayerPinStatus(username) {
  return invokePlayerLogin({ action: "status", username });
}

export async function setupPlayerPin(username, setupCode, pin) {
  const data = await invokePlayerLogin({
    action: "setup",
    username,
    setup_code: setupCode,
    pin,
  });
  await establishPlayerSession(data);
}

async function invokePlayerLogin(body) {
  const { data, error } = await supabase.functions.invoke("player-login", {
    body,
  });
  if (error) {
    let payload;
    try {
      payload = await error.context?.json();
    } catch (_) {
      payload = null;
    }
    // Supabase reports non-2xx function responses as a generic FunctionsHttpError.
    // Surface the safe, purpose-written message returned by our Edge Function.
    throw new Error(payload?.error || error.message);
  }
  return data;
}

async function establishPlayerSession(data) {
  if (!data?.token_hash)
    throw new Error("플레이어 로그인 응답을 확인할 수 없습니다.");
  const { error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "magiclink",
  });
  if (sessionError) throw sessionError;
}
