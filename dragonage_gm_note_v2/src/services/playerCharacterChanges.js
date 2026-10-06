import { supabase } from "@/supabase";

export async function submitPlayerCharacterChange(changes) {
  const { data, error } = await supabase.rpc("player_submit_character_change", {
    p_changes: changes,
  });
  if (error) throw error;
  return data;
}

export async function getPlayerCharacterChangeStatus() {
  const { data, error } = await supabase.rpc("player_character_change_status");
  if (error) throw error;
  return data?.[0] || null;
}

export async function getTeamCharacterChangeRequests(teamId) {
  const { data, error } = await supabase.rpc(
    "list_team_character_change_requests",
    {
      p_team_id: teamId,
    }
  );
  if (error) throw error;
  return data || [];
}

export async function reviewPlayerCharacterChange(requestId, approve) {
  const { error } = await supabase.rpc("review_player_character_change", {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw error;
}
