-- Private team HTML log archives. Managers upload/delete; each player can
-- read archives belonging to their own team. HTML is rendered by the client
-- in an isolated, script-disabled sandbox.

CREATE TABLE IF NOT EXISTS public.team_log_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES public.scenarios(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_name text NOT NULL CHECK (file_name ~* '\.html?$'),
  storage_path text NOT NULL UNIQUE,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_log_backups
  ADD COLUMN IF NOT EXISTS scenario_id uuid
  REFERENCES public.scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS team_log_backups_team_created_idx
  ON public.team_log_backups(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_log_backups_scenario_idx
  ON public.team_log_backups(team_id, scenario_id, created_at DESC);

ALTER TABLE public.team_log_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_log_backups FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_log_backups TO authenticated;

DROP POLICY IF EXISTS team_log_backups_read ON public.team_log_backups;
CREATE POLICY team_log_backups_read ON public.team_log_backups
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
  );

DROP POLICY IF EXISTS team_log_backups_manager_insert ON public.team_log_backups;
CREATE POLICY team_log_backups_manager_insert ON public.team_log_backups
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_is_gm()
    AND uploaded_by = auth.uid()
    AND storage_path LIKE auth.uid()::text || '/' || team_id::text || '/%'
    AND (
      scenario_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.scenarios s
        JOIN public.teams t ON t.id = public.team_log_backups.team_id
        WHERE s.id = public.team_log_backups.scenario_id
          AND s.campaign_id = t.campaign_id
      )
    )
  );

DROP POLICY IF EXISTS team_log_backups_manager_delete ON public.team_log_backups;
CREATE POLICY team_log_backups_manager_delete ON public.team_log_backups
  FOR DELETE TO authenticated USING (public.current_user_is_gm());

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-log-backups', 'team-log-backups', false, 10485760,
  ARRAY['text/html']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['text/html'];

DROP POLICY IF EXISTS team_log_backups_storage_read ON storage.objects;
CREATE POLICY team_log_backups_storage_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'team-log-backups'
    AND EXISTS (
      SELECT 1 FROM public.team_log_backups archive
      WHERE archive.storage_path = name
        AND (
          public.current_user_is_gm()
          OR archive.team_id IN (
            SELECT pc.team_id FROM public.player_character_context() pc
          )
        )
    )
  );

DROP POLICY IF EXISTS team_log_backups_storage_manager_insert ON storage.objects;
CREATE POLICY team_log_backups_storage_manager_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'team-log-backups'
    AND public.current_user_is_gm()
    AND name LIKE auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS team_log_backups_storage_manager_delete ON storage.objects;
CREATE POLICY team_log_backups_storage_manager_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'team-log-backups' AND public.current_user_is_gm()
  );

GRANT SELECT, INSERT, DELETE ON public.team_log_backups TO authenticated;
NOTIFY pgrst, 'reload schema';
