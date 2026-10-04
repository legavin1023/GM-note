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
  return data || [];
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
  return data || [];
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
