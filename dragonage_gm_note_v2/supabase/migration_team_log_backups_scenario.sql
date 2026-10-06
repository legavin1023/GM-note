-- Add optional chapter/scenario links to existing team log backups.
-- Run after migration_team_log_backups.sql.

ALTER TABLE public.team_log_backups
  ADD COLUMN IF NOT EXISTS scenario_id uuid
  REFERENCES public.scenarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_log_backups_scenario_idx
  ON public.team_log_backups(team_id, scenario_id, created_at DESC);

DROP POLICY IF EXISTS team_log_backups_manager_insert
  ON public.team_log_backups;
CREATE POLICY team_log_backups_manager_insert
  ON public.team_log_backups FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_gm()
    AND uploaded_by = auth.uid()
    AND storage_path LIKE auth.uid()::text || '/' || team_id::text || '/%'
    AND (
      scenario_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.scenarios s
        JOIN public.teams t ON t.id = public.team_log_backups.team_id
        WHERE s.id = public.team_log_backups.scenario_id
          AND s.campaign_id = t.campaign_id
      )
    )
  );

NOTIFY pgrst, 'reload schema';
