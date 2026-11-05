-- Apply after migration_npc_lore_and_master_art.sql.
-- Restrictive policy also protects against additional permissive read policies.
BEGIN;
ALTER TABLE public.scenario_npcs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scenario_npcs_team_visibility ON public.scenario_npcs;
CREATE POLICY scenario_npcs_team_visibility ON public.scenario_npcs
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  public.current_user_is_gm()
  OR EXISTS (
    SELECT 1 FROM public.player_character_context() pc
    JOIN public.teams t ON t.id = pc.team_id AND t.campaign_id = pc.campaign_id
    WHERE pc.campaign_id = scenario_npcs.campaign_id
      AND t.progress_step IS NOT NULL
      AND t.progress_step >= 1
      AND scenario_npcs.scenario_step >= 1
      AND scenario_npcs.scenario_step < t.progress_step
  )
);
-- Ratings/comments already read scenario_npcs through RLS, so hidden NPC
-- metadata and feedback remain inaccessible through direct REST requests.
COMMIT;
