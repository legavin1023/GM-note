-- Resolve artwork post/comment authors to their character token images without
-- exposing the users table directly to players. Run after
-- migration_player_team_assets.sql and migration_team_art_board.sql.

CREATE OR REPLACE FUNCTION public.team_art_author_profiles(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, token_url text, is_gm boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH requested AS (
    SELECT DISTINCT ids.requested_id AS user_id
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS ids(requested_id)
    WHERE ids.requested_id IS NOT NULL
  ), player_profiles AS (
    SELECT mapping.user_id AS author_user_id, profile.token_url, false AS is_gm
    FROM requested r
    JOIN public.player_team_members mapping ON mapping.user_id = r.user_id
    JOIN public.users profile ON profile.username = mapping.login_username
    JOIN public.teams profile_team ON profile_team.id = profile.team_id
    WHERE NULLIF(profile.token_url, '') IS NOT NULL
      AND (
        public.current_user_is_gm()
        OR profile_team.campaign_id IN (
          SELECT viewer.campaign_id FROM public.player_character_context() viewer
        )
      )
  ), legacy_profiles AS (
    -- Some imported rows used public.users.id rather than the mapped Auth ID.
    SELECT profile.id AS author_user_id, profile.token_url,
      lower(btrim(COALESCE(to_jsonb(profile)->>'role', ''))) = 'admin' AS is_gm
    FROM requested r
    JOIN public.users profile ON profile.id = r.user_id
    LEFT JOIN public.teams profile_team ON profile_team.id = profile.team_id
    WHERE (
        lower(btrim(COALESCE(to_jsonb(profile)->>'role', ''))) = 'admin'
        OR NULLIF(profile.token_url, '') IS NOT NULL
      )
      AND (
        lower(btrim(COALESCE(to_jsonb(profile)->>'role', ''))) = 'admin'
        OR public.current_user_is_gm()
        OR profile_team.campaign_id IN (
          SELECT viewer.campaign_id FROM public.player_character_context() viewer
        )
      )
  )
  SELECT profiles.author_user_id, profiles.token_url, profiles.is_gm
  FROM (
    SELECT * FROM player_profiles
    UNION
    SELECT * FROM legacy_profiles
  ) profiles
$$;
ALTER FUNCTION public.team_art_author_profiles(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_art_author_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_art_author_profiles(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
