/**
 * campaigns.js — Campaign Supabase functions
 */
import { supabase } from "@/supabase";

/**
 * List campaigns visible to the authenticated user. Database RLS applies access.
 */
export async function getCampaigns() {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, owner_id, title, version, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase] CAMPAIGNS ERROR", error);
    throw error;
  }
  return data || [];
}

/**
 * Create a campaign for the authenticated GM.
 */
export async function createCampaign(ownerId, title = "Dragon Age") {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ owner_id: ownerId, title })
    .select()
    .single();

  if (error) throw error;
  return data;
}
