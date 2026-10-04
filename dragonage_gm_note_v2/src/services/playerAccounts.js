import { supabase } from "@/supabase";

export async function getCampaignPlayerAccounts(campaignId) {
  const { data, error } = await supabase.rpc("list_campaign_player_accounts", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return data || [];
}

export async function getPlayerLoginUsernames() {
  const { data, error } = await supabase
    .from("users")
    .select("username")
    .not("username", "is", null)
    .not("team_id", "is", null)
    .order("username");
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.username).filter(Boolean))];
}

export async function assignPlayerAccount(userId, teamId, username) {
  const { error } = await supabase.rpc("assign_player_account_to_team", {
    p_user_id: userId,
    p_team_id: teamId,
    p_login_username: username,
  });
  if (error) throw error;
}

export async function signInPlayer(username, password) {
  const { data, error } = await supabase.functions.invoke("player-login", {
    body: { username, password },
  });
  if (error) {
    let payload;
    try {
      payload = await error.context?.json();
    } catch (_) {
      payload = null;
    }
    if (payload?.error === "Invalid username or password") {
      throw new Error("Invalid login credentials");
    }
    throw error;
  }
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error("로그인 응답이 올바르지 않습니다.");
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw sessionError;
}

export async function unassignPlayerAccount(userId, teamId) {
  const { error } = await supabase.rpc("unassign_player_account_from_team", {
    p_user_id: userId,
    p_team_id: teamId,
  });
  if (error) throw error;
}
