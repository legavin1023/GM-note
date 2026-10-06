/**
 * teams.js — 팀 관련 Supabase 함수
 */
import { supabase } from "@/supabase";

/**
 * 캠페인 내 모든 팀 조회 (캐릭터 포함)
 */
export async function getTeams(campaignId) {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[Supabase] TEAMS/USERS ERROR", error);
    throw error;
  }
  return (data || []).map((team) => ({ ...team, characters: [] }));
}

/**
 * 팀 하나 조회
 */
export async function getTeam(teamId) {
  const { data, error } = await supabase
    .from("teams")
    .select(
      `
      id, name, description, region, color, sort_order,
      progress_step, total_steps, campaign_id, created_at, is_frozen,
      users(
        id, team_id, username, character_name, player, token_url, level,
        age, height, weight, race, background, social_class, class,
        motivation, goal, strengths, doom, languages, traits,
        biography, gm_secret, player_gm_secret, character_quirk, updated_at
      )
    `
    )
    .eq("id", teamId)
    .single();

  if (error) throw error;
  return { ...data, characters: data.users || [] };
}

/**
 * 팀 생성
 */
export async function createTeam(campaignId, teamData) {
  const { data, error } = await supabase
    .from("teams")
    .insert({
      campaign_id: campaignId,
      name: teamData.name || "새 팀",
      description: teamData.description || "",
      region: teamData.region || "",
      color: teamData.color || "#b42332",
      sort_order: teamData.sort_order || 0,
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, characters: [] };
}

/**
 * Player-owned public team profile. Progress and GM-only fields are rejected
 * by the RPC whitelist.
 */
export async function updatePlayerTeamProfile(updates) {
  const { data, error } = await supabase.rpc("player_update_team_profile", {
    p_updates: updates,
  });
  if (error) throw error;
  return data;
}

/**
 * 팀 수정
 */
export async function updateTeam(teamId, updates) {
  const allowed = [
    "name",
    "description",
    "region",
    "color",
    "sort_order",
    "progress_step",
    "total_steps",
    "is_frozen",
  ];
  const payload = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from("teams")
    .update(payload)
    .eq("id", teamId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 팀 삭제
 */
export async function deleteTeam(teamId) {
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw error;
}

/**
 * 팀 진행 단계 조회
 */
export async function getProgressStages() {
  const { data, error } = await supabase
    .from("progress_stages")
    .select("step_number, title, description, is_active")
    .order("step_number", { ascending: true });

  if (error) {
    // Keep the tracker usable before the optional activation migration is run.
    if (error.code === "42703" || error.code === "PGRST204") {
      const { data: legacyData, error: legacyError } = await supabase
        .from("progress_stages")
        .select("step_number, title, description")
        .order("step_number", { ascending: true });
      if (legacyError) throw legacyError;
      return (legacyData || []).map((stage) => ({
        ...stage,
        is_active: true,
      }));
    }
    console.error("[Supabase] PROGRESS_STAGES ERROR", error);
    throw error;
  }
  return data || [];
}

/** Toggle whether a progress stage appears in the player tracker. */
export async function setProgressStageActive(stepNumber, isActive) {
  const { data, error } = await supabase
    .from("progress_stages")
    .update({ is_active: Boolean(isActive) })
    .eq("step_number", stepNumber)
    .select("step_number, title, description, is_active")
    .single();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error(
        "비활성화 기능을 사용하려면 migration_progress_stage_activation.sql을 먼저 적용하세요."
      );
    }
    throw error;
  }
  return data;
}
