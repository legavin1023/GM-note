/**
 * characters.js — 캐릭터(users 테이블) 관련 Supabase 함수
 *
 * DB 테이블명은 users지만 실제로는 TRPG 캐릭터 데이터.
 * Supabase Auth(auth.users) = GM 로그인 계정과 완전히 별개.
 */
import { supabase } from "@/supabase";

/** Load character rows belonging to the provided campaign teams. */
export async function getCharactersForTeams(teamIds) {
  if (!teamIds.length) return [];
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("team_id", teamIds)
    .order("character_name", { ascending: true });
  if (error) {
    console.error("[Supabase] USERS/CHARACTERS ERROR", error);
    throw error;
  }
  return data || [];
}

// 저장 허용 필드 화이트리스트 (character_quirk = 건지)
const CHARACTER_FIELDS = [
  "id",
  "team_id",
  "username",       // 로그인 아이디
  "character_name", // 캐릭터 이름
  "player",         // PL 이름
  "token_url",      // 토큰 이미지 URL
  "level",          // 레벨
  "age",            // 나이
  "height",         // 키
  "weight",         // 몸무게
  "race",           // 종족
  "background",     // 배경
  "social_class",   // 사회 계층
  "class",          // 클래스
  "motivation",     // 동기
  "goal",           // 목표
  "strengths",      // 장점
  "doom",           // 파멸
  "languages",      // 언어
  "traits",         // 특징
  "character_quirk",// 건지
  "biography",      // 캐릭터 소개
  "gm_secret",      // GM 비밀 메모
  "player_gm_secret",
  "gm_core_belief",
  "gm_regret",
  "gm_cherished_person",
  "gm_desire",
  "gm_fear",
  "gm_unknown_secret",
  "gm_backstory_hooks",
];

/**
 * 팀의 캐릭터 목록 조회
 */
export async function getCharactersByTeam(teamId) {
  const { data, error } = await supabase
    .from("users")
    .select(CHARACTER_FIELDS.filter((f) => f !== "id" && f !== "team_id").join(", ") + ", id, team_id, updated_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 단일 캐릭터 조회
 */
export async function getCharacter(characterId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", characterId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * 캠페인 내 모든 캐릭터 조회 (팀 join)
 */
export async function getAllCharacters(campaignId) {
  const { data, error } = await supabase
    .from("users")
    .select(
      `*, teams!inner(id, name, color, campaign_id)`
    )
    .eq("teams.campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 캐릭터 저장 (생성 or 수정)
 */
export async function saveCharacter(character) {
  const payload = CHARACTER_FIELDS.reduce((row, field) => {
    if (character[field] !== undefined) row[field] = character[field];
    return row;
  }, {});

  // id가 없으면 INSERT, 있으면 UPSERT
  if (!payload.team_id) {
    throw new Error("저장할 캐릭터의 소속 팀을 선택하세요.");
  }

  // Character rows must belong to a team visible under the current GM's RLS.
  const { data: visibleTeam, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .eq("id", payload.team_id)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!visibleTeam) {
    throw new Error("선택한 팀에 접근할 수 없습니다. 현재 캠페인에 속한 팀을 선택하세요.");
  }

  if (!payload.id) {
    payload.id = crypto.randomUUID();
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 캐릭터 삭제
 */
export async function deleteCharacter(characterId) {
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", characterId);

  if (error) throw error;
}

/**
 * 토큰 이미지 업로드 후 URL 반환
 * Storage 버킷: campaign-assets
 * 경로: teams/{team_id}/characters/{character_id}/{filename}
 */
export async function uploadTokenImage(file, teamId, characterId, campaignId, ownerLabel = "") {
  const ext = file.name.split(".").pop();
  const path = `teams/${teamId}/characters/${characterId}/tokens/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("campaign-assets")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    // fallback: post-images 버킷 시도
    const { error: fallbackError } = await supabase.storage
      .from("post-images")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (fallbackError) throw fallbackError;

    const { data } = supabase.storage.from("post-images").getPublicUrl(path);
    await registerTokenImage({ campaignId, teamId, characterId, url: data.publicUrl, ownerLabel });
    return data.publicUrl;
  }

  const { data } = supabase.storage
    .from("campaign-assets")
    .getPublicUrl(path);
  await registerTokenImage({ campaignId, teamId, characterId, url: data.publicUrl, ownerLabel });
  return data.publicUrl;
}

export async function getTokenImageHistory(characterId) {
  const { data, error } = await supabase
    .from("images")
    .select("id, url, created_at")
    .eq("character_id", characterId)
    .eq("caption", "__character_token__")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function registerTokenImage({ campaignId, teamId, characterId, url, ownerLabel }) {
  const { error } = await supabase.from("images").insert({
    campaign_id: campaignId || null,
    team_id: teamId || null,
    character_id: characterId,
    url,
    caption: "__character_token__",
    owner_label: ownerLabel,
  });
  if (error) throw error;
}

/**
 * 토큰 이미지 삭제
 */
export async function deleteTokenImage(teamId, characterId) {
  const extensions = ["jpg", "jpeg", "png", "gif", "webp"];
  for (const ext of extensions) {
    const path = `teams/${teamId}/characters/${characterId}/token.${ext}`;
    await supabase.storage.from("campaign-assets").remove([path]);
  }
}
