-- Player login username list. Team membership and credentials stay in
-- public.users; player_team_members is only the internal Auth/RLS identity map.
-- Run after migration_player_access.sql.

DROP FUNCTION IF EXISTS public.list_campaign_player_accounts(uuid);
DROP FUNCTION IF EXISTS public.list_player_login_emails();
DROP FUNCTION IF EXISTS public.assign_player_account_to_team(uuid, uuid);
DROP FUNCTION IF EXISTS public.assign_player_account_to_team(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.unassign_player_account_from_team(uuid, uuid);

CREATE OR REPLACE FUNCTION public.list_player_login_usernames()
RETURNS TABLE(username text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT u.username
  FROM public.users u
  WHERE u.username IS NOT NULL AND u.team_id IS NOT NULL
  ORDER BY u.username
$$;
REVOKE ALL ON FUNCTION public.list_player_login_usernames() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_player_login_usernames() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
