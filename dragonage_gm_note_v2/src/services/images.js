/**
 * images.js — 토큰 갤러리 관련 Supabase 함수
 */
import { supabase } from "@/supabase";

/**
 * 팀 이미지 목록 조회
 */
export async function getTeamImages(teamId) {
  const { data, error } = await supabase
    .from("images")
    .select("id, team_id, character_id, url, caption, owner_label, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return galleryImages(data);
}

/** Load the player's campaign gallery, including current users.token_url values. */
export async function getPlayerTeamGalleryImages(
  teamId,
  campaignId,
  teams = []
) {
  if (!teamId) return [];

  // Player RLS can hide campaign-wide images from the direct table query. Do
  // not let that failure suppress the safe gallery RPC or profile token URLs.
  const [campaignResult, rpcResult] = await Promise.allSettled([
    campaignId ? getCampaignImages(campaignId) : Promise.resolve([]),
    supabase.rpc("player_team_gallery_images"),
  ]);
  const campaignImages =
    campaignResult.status === "fulfilled" ? campaignResult.value : [];
  const supplementalImageRows =
    rpcResult.status === "fulfilled" && Array.isArray(rpcResult.value.data)
      ? rpcResult.value.data
      : [];

  const seenUrls = new Set();
  const gallery = [];
  const campaignImageRows = Array.isArray(campaignImages) ? campaignImages : [];
  for (const image of [...campaignImageRows, ...supplementalImageRows]) {
    if (!image.url || seenUrls.has(image.url)) continue;
    seenUrls.add(image.url);
    gallery.push({
      ...image,
      caption:
        image.caption === "__character_token__" ? "캐릭터 토큰" : image.caption,
      owner_label: image.owner_label || "",
    });
  }

  // The player's team profiles are loaded through a secret-free RPC. Their
  // token_url values are the same source used on the team character cards, so
  // include them even if the optional image-history/RPC path is unavailable.
  const tokens = includeCurrentCharacterTokens(gallery, teams);
  if (
    !tokens.length &&
    campaignResult.status === "rejected" &&
    (rpcResult.status === "rejected" || rpcResult.value?.error)
  ) {
    throw rpcResult.status === "rejected"
      ? rpcResult.reason
      : rpcResult.value.error || campaignResult.reason;
  }
  return tokens;
}

/**
 * 캠페인 이미지 전체 조회 (팀별 필터링 가능)
 */
export async function getCampaignImages(campaignId) {
  const { data, error } = await supabase
    .from("images")
    .select(
      "id, campaign_id, team_id, character_id, url, caption, owner_label, created_at"
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return galleryImages(data);
}

/** Add each team's current character token when no image-history row exists. */
export function includeCurrentCharacterTokens(images, teams) {
  const result = [...(images || [])];
  const charactersById = new Map();
  const charactersByUrl = new Map();

  for (const team of teams || []) {
    for (const character of team.characters || []) {
      const url = character.token_url?.trim();
      charactersById.set(character.id, { team, character });
      if (url) {
        const matches = charactersByUrl.get(url) || [];
        matches.push({ team, character });
        charactersByUrl.set(url, matches);
      }
    }
  }

  // Legacy image records sometimes have a missing/stale team_id. Resolve a
  // character-linked token against the safe team roster before the UI applies
  // its team filter; otherwise the token can exist in data but disappear from
  // that character's team's gallery.
  for (const image of result) {
    const linkedCharacter = image.character_id
      ? charactersById.get(image.character_id)
      : null;
    const urlMatches = image.url ? charactersByUrl.get(image.url) || [] : [];
    const resolved =
      linkedCharacter || (urlMatches.length === 1 ? urlMatches[0] : null);
    if (!resolved) continue;
    image.team_id = resolved.team.id;
    image.character_id = resolved.character.id;
    image.caption =
      image.caption || resolved.character.character_name || "캐릭터 토큰";
    image.owner_label = image.owner_label || resolved.character.player || "";
  }

  const seenUrls = new Set(result.map((image) => image.url).filter(Boolean));
  for (const team of teams || []) {
    for (const character of team.characters || []) {
      const url = character.token_url?.trim();
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      result.push({
        id: `current-token-${character.id}`,
        campaign_id: team.campaign_id,
        team_id: team.id,
        character_id: character.id,
        url,
        caption: character.character_name || "캐릭터 토큰",
        owner_label: character.player || "",
        created_at: null,
      });
    }
  }

  return result;
}

function galleryImages(rows) {
  return (rows || []).map((image) => ({
    ...image,
    caption:
      image.caption === "__character_token__" ? "캐릭터 토큰" : image.caption,
  }));
}

/**
 * 이미지 저장 (URL 등록)
 */
export async function saveImage({
  campaignId,
  teamId,
  characterId,
  url,
  caption,
  ownerLabel,
}) {
  const { data, error } = await supabase
    .from("images")
    .insert({
      campaign_id: campaignId || null,
      team_id: teamId || null,
      character_id: characterId || null,
      url,
      caption: caption || "",
      owner_label: ownerLabel || "",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 이미지 삭제
 */
export async function deleteImage(imageId) {
  const { error } = await supabase.from("images").delete().eq("id", imageId);
  if (error) throw error;
}

/**
 * 이미지 파일 업로드 후 URL 반환
 */
export async function uploadGalleryImage(file, campaignId, teamId) {
  const timestamp = Date.now();
  const ext = file.name.split(".").pop();
  const path = `gallery/${campaignId}/${
    teamId || "common"
  }/${timestamp}.${ext}`;

  // campaign-assets 버킷 시도
  const { error: uploadError } = await supabase.storage
    .from("campaign-assets")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    // fallback: post-images 버킷
    const { error: fallbackError } = await supabase.storage
      .from("post-images")
      .upload(path, file, { upsert: false, contentType: file.type });

    if (fallbackError) throw fallbackError;

    const { data } = supabase.storage.from("post-images").getPublicUrl(path);
    return data.publicUrl;
  }

  const { data } = supabase.storage.from("campaign-assets").getPublicUrl(path);
  return data.publicUrl;
}
