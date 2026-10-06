-- player_team_context() is used by the teams SELECT policy and reads teams
-- itself. Run it as its privileged owner with RLS disabled to avoid evaluating
-- the same teams policy recursively. The function still returns only the
-- authenticated user's mapped team and campaign.

ALTER FUNCTION public.player_team_context() OWNER TO postgres;
ALTER FUNCTION public.player_team_context() SET row_security = off;
GRANT EXECUTE ON FUNCTION public.player_team_context() TO authenticated;

NOTIFY pgrst, 'reload schema';
