/**
 * campaigns.js — 캠페인 관련 Supabase 함수
 */
import { supabase } from "@/supabase";

/**
 * 로그인한 GM의 캠페인 목록 조회
 */
export async function getCampaigns(ownerId) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, owner_id, title, version, created_at, updated_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase] CAMPAIGNS ERROR", error);
    throw error;
  }
  return data || [];
}

/**
 * 캠페인 하나 생성 (처음 사용 시)
 */
export async function createCampaign(ownerId, title = "드래곤 에이지") {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ owner_id: ownerId, title })
    .select()
    .single();

  if (error) throw error;
  return data;
}
