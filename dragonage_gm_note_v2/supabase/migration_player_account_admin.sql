-- GM-only Auth account lookup and team assignment for the player dropdown.
-- Run after migration_player_access.sql.

DROP FUNCTION IF EXISTS public.list_campaign_player_accounts(uuid);
CREATE FUNCTION public.list_campaign_player_accounts(p_campaign_id uuid)
RETURNS TABLE(user_id uuid, email text, team_id uuid, login_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id AND c.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage accounts for this campaign';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, COALESCE(mapped.team_id, m.team_id), m.login_username
  FROM auth.users u
  LEFT JOIN public.player_team_members m ON m.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT min(profile.team_id::text)::uuid AS team_id
    FROM public.users profile
    WHERE profile.username = m.login_username
      AND profile.team_id IS NOT NULL
    HAVING count(DISTINCT profile.team_id) = 1
  ) mapped ON true
  LEFT JOIN public.teams assigned_team ON assigned_team.id = COALESCE(mapped.team_id, m.team_id)
  WHERE NOT EXISTS (SELECT 1 FROM public.campaigns owned WHERE owned.owner_id = u.id)
    AND (m.user_id IS NULL OR assigned_team.campaign_id = p_campaign_id)
  ORDER BY lower(u.email), u.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_campaign_player_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_campaign_player_accounts(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.list_player_login_emails();
CREATE OR REPLACE FUNCTION public.list_player_login_usernames()
RETURNS TABLE(username text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT m.login_username
  FROM public.player_team_members m
  WHERE m.login_username IS NOT NULL
  ORDER BY m.login_username
$$;
REVOKE ALL ON FUNCTION public.list_player_login_usernames() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_player_login_usernames() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.assign_player_account_to_team(uuid, uuid);
CREATE FUNCTION public.assign_player_account_to_team(p_user_id uuid, p_team_id uuid, p_login_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_campaign_id uuid;
  assigned_campaign_id uuid;
BEGIN
  SELECT t.campaign_id INTO target_campaign_id
  FROM public.teams t
  JOIN public.campaigns c ON c.id = t.campaign_id AND c.owner_id = auth.uid()
  WHERE t.id = p_team_id;
  IF target_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to assign accounts to this team';
  END IF;

  IF EXISTS (SELECT 1 FROM public.campaigns c WHERE c.owner_id = p_user_id) THEN
    RAISE EXCEPTION 'Campaign owners cannot be assigned as player accounts';
  END IF;

  IF NULLIF(btrim(p_login_username), '') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.team_id = p_team_id AND u.username = btrim(p_login_username)
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.username = btrim(p_login_username)
      AND u.team_id IS DISTINCT FROM p_team_id
  ) THEN
    RAISE EXCEPTION 'Select a valid username belonging to this team';
  END IF;

  SELECT t.campaign_id INTO assigned_campaign_id
  FROM public.player_team_members m
  LEFT JOIN LATERAL (
    SELECT min(profile.team_id::text)::uuid AS team_id
    FROM public.users profile
    WHERE profile.username = m.login_username
      AND profile.team_id IS NOT NULL
    HAVING count(DISTINCT profile.team_id) = 1
  ) mapped ON true
  JOIN public.teams t ON t.id = COALESCE(mapped.team_id, m.team_id)
  WHERE m.user_id = p_user_id;
  IF assigned_campaign_id IS NOT NULL AND assigned_campaign_id <> target_campaign_id THEN
    RAISE EXCEPTION 'This account is already assigned to another campaign';
  END IF;

  INSERT INTO public.player_team_members(user_id, login_username)
  VALUES (p_user_id, btrim(p_login_username))
  ON CONFLICT (user_id) DO UPDATE
  SET login_username = EXCLUDED.login_username;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_player_account_to_team(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_player_account_to_team(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_player_account_from_team(p_user_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.campaigns c ON c.id = t.campaign_id AND c.owner_id = auth.uid()
    WHERE t.id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage this team';
  END IF;
  DELETE FROM public.player_team_members
  WHERE user_id = p_user_id
    AND (
      login_username IN (SELECT u.username FROM public.users u WHERE u.team_id = p_team_id)
      OR (login_username IS NULL AND team_id = p_team_id)
    );
END;
$$;
REVOKE ALL ON FUNCTION public.unassign_player_account_from_team(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_player_account_from_team(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
