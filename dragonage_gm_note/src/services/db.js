import { supabase } from "@/supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase 환경변수가 없습니다. 개발 서버를 재시작하고 .env의 VUE_APP_SUPABASE_URL, VUE_APP_SUPABASE_ANON_KEY를 확인하세요."
    );
  }
  return supabase;
}

export async function getCampaigns(ownerId) {
  const { data, error } = await requireSupabase()
    .from("campaigns")
    .select("id, owner_id, title, version, created_at, updated_at")
    .eq("owner_id", ownerId);

  if (error) throw error;
  return data || [];
}

export async function getCampaignDetails(campaignId) {
  const client = requireSupabase();
  const [teamsResult, scenariosResult] = await Promise.all([
    client
      .from("teams")
      .select("*, team_scenarios(*, team_scenario_answers(*))")
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true }),
    client
      .from("scenarios")
      .select("*, scenario_questions(*, question_choices(*))")
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true }),
  ]);

  if (teamsResult.error) throw teamsResult.error;
  if (scenariosResult.error) throw scenariosResult.error;

  return {
    teams: teamsResult.data || [],
    scenarios: scenariosResult.data || [],
  };
}

export async function getProgressStages() {
  const { data, error } = await requireSupabase()
    .from("progress_stages")
    .select("*, scenario_questions(*, question_choices(*))")
    .order("step_number", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getTeamsWithUsers(campaignId) {
  const client = requireSupabase();
  let query = client
    .from("teams")
    .select("*, users(*)")
    .order("sort_order", { ascending: true });
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((team) => ({
    ...team,
    users: team.users || [],
  }));
}

export async function saveScenario(scenario) {
  const { data, error } = await requireSupabase()
    .from("scenarios")
    .upsert(scenario, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveTeamScenario(teamId, stepNumber, completed, gmNote) {
  const { data, error } = await requireSupabase()
    .from("team_scenarios")
    .upsert(
      {
        team_id: teamId,
        step_number: stepNumber,
        completed,
        gm_note: gmNote || "",
      },
      { onConflict: "team_id,step_number" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

const USER_SAVE_FIELDS = [
  "id",
  "team_id",
  "username",
  "player",
  "token_url",
  "level",
  "age",
  "height",
  "weight",
  "race",
  "background",
  "social_class",
  "class",
  "motivation",
  "goal",
  "strengths",
  "doom",
  "languages",
  "traits",
  "biography",
  "gm_secret",
  "player_gm_secret",
];

export async function saveUser(character) {
  const payload = USER_SAVE_FIELDS.reduce((row, field) => {
    if (character[field] !== undefined) row[field] = character[field];
    return row;
  }, {});

  const { data, error } = await requireSupabase()
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteUser(userId) {
  const { error } = await requireSupabase()
    .from("users")
    .delete()
    .eq("id", userId);

  if (error) throw error;
}

export async function uploadImage(file, path) {
  const { error } = await requireSupabase()
    .storage.from("post-images")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  const { data } = requireSupabase()
    .storage.from("post-images")
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function signIn(email, password) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
