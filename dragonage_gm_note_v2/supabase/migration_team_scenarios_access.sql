-- Restore the authenticated GM's CRUD access to records for owned teams.
-- RLS remains enabled; this does not grant access to another campaign's rows.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_scenarios TO authenticated;

ALTER TABLE public.team_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_scenarios_owner_all" ON public.team_scenarios;
CREATE POLICY "team_scenarios_owner_all" ON public.team_scenarios
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE t.id = team_scenarios.team_id
        AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE t.id = team_scenarios.team_id
        AND c.owner_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
