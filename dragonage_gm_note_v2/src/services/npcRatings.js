import { supabase } from "@/supabase";

export async function getNpcRatingSummaries(npcIds) {
  const ids = [...new Set((npcIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("scenario_npc_ratings")
    .select("npc_id, rating")
    .in("npc_id", ids);
  if (error) throw error;

  return (data || []).reduce((summaries, row) => {
    const summary = summaries[row.npc_id] || { total: 0, count: 0, average: 0 };
    summary.total += Number(row.rating) || 0;
    summary.count += 1;
    summary.average = summary.total / summary.count;
    summaries[row.npc_id] = summary;
    return summaries;
  }, {});
}

export function formatNpcRating(summary) {
  if (!summary?.count) return "평점 없음";
  return `★ ${summary.average.toFixed(1)} · ${summary.count}명`;
}
