-- Break recursive policy chains around public.teams. Apply after the other
-- player-access and shared-GM migrations, so this remains the final teams RLS
-- definition.

ALTER FUNCTION public.player_team_context() OWNER TO postgres;
ALTER FUNCTION public.player_team_context() SET row_security = off;
GRANT EXECUTE ON FUNCTION public.player_team_context() TO authenticated;

ALTER FUNCTION public.player_character_context() OWNER TO postgres;
ALTER FUNCTION public.player_character_context() SET row_security = off;
GRANT EXECUTE ON FUNCTION public.player_character_context() TO authenticated;

ALTER FUNCTION public.current_user_is_gm() OWNER TO postgres;
ALTER FUNCTION public.current_user_is_gm() SET row_security = off;
REVOKE ALL ON FUNCTION public.current_user_is_gm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_gm() TO authenticated;

-- These helpers read teams/campaigns as postgres with RLS disabled. Policies
-- on teams call the helpers instead of querying teams/campaigns directly.
CREATE OR REPLACE FUNCTION public.current_user_can_read_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teams t
    LEFT JOIN public.campaigns c ON c.id = t.campaign_id
    WHERE t.id = p_team_id
      AND (
        public.current_user_is_gm()
        OR c.owner_id = auth.uid()
        OR t.id IN (SELECT pc.team_id FROM public.player_team_context() pc)
      )
  )
$$;
ALTER FUNCTION public.current_user_can_read_team(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_can_read_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_team(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_team(
  p_team_id uuid,
  p_campaign_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.current_user_is_gm()
    OR EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = p_campaign_id
        AND c.owner_id = auth.uid()
        AND (
          p_team_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = p_team_id AND t.campaign_id = p_campaign_id
          )
        )
    )
  )
$$;
ALTER FUNCTION public.current_user_can_manage_team(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_can_manage_team(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_team(uuid, uuid)
  TO authenticated;

DROP POLICY IF EXISTS "teams_owner_all" ON public.teams;
DROP POLICY IF EXISTS "teams_player_read" ON public.teams;
DROP POLICY IF EXISTS "teams_shared_gm_all" ON public.teams;
DROP POLICY IF EXISTS "teams_read_without_recursion" ON public.teams;
DROP POLICY IF EXISTS "teams_insert_managed_campaign" ON public.teams;
DROP POLICY IF EXISTS "teams_update_managed_campaign" ON public.teams;
DROP POLICY IF EXISTS "teams_delete_managed_campaign" ON public.teams;

CREATE POLICY "teams_read_without_recursion" ON public.teams
  FOR SELECT TO authenticated
  USING (public.current_user_can_read_team(id));

CREATE POLICY "teams_insert_managed_campaign" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_team(NULL, campaign_id));

CREATE POLICY "teams_update_managed_campaign" ON public.teams
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_team(id, campaign_id))
  WITH CHECK (public.current_user_can_manage_team(id, campaign_id));

CREATE POLICY "teams_delete_managed_campaign" ON public.teams
  FOR DELETE TO authenticated
  USING (public.current_user_can_manage_team(id, campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;

NOTIFY pgrst, 'reload schema';
