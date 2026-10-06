-- Prefer the player's actual login username for artwork comment labels.
-- Run after migration_team_art_comment_author_names.sql.

CREATE OR REPLACE FUNCTION public.team_art_author_display_names(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, player_name text, character_name text, is_gm boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH requested AS (
    SELECT DISTINCT ids.requested_id AS user_id
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS ids(requested_id)
    WHERE ids.requested_id IS NOT NULL
  ), mapped_players AS (
    SELECT m.user_id,
      COALESCE(NULLIF(btrim(u.username), ''), NULLIF(btrim(u.player), ''), '플레이어') AS player_name,
      COALESCE(NULLIF(btrim(u.character_name), ''), '캐릭터') AS character_name,
      false AS is_gm
    FROM requested r
    JOIN public.player_team_members m ON m.user_id = r.user_id
    JOIN public.users u ON u.username = m.login_username
    WHERE EXISTS (
      SELECT 1 FROM public.team_art_posts p WHERE p.user_id = m.user_id
    ) OR EXISTS (
      SELECT 1 FROM public.team_art_comments c WHERE c.user_id = m.user_id
    )
  ), mapped_masters AS (
    SELECT u.id AS user_id,
      '마스터'::text AS player_name,
      COALESCE(NULLIF(btrim(u.username), ''), NULLIF(btrim(u.character_name), ''), '마스터') AS character_name,
      true AS is_gm
    FROM requested r
    JOIN public.users u ON u.id = r.user_id
    WHERE lower(btrim(COALESCE(to_jsonb(u)->>'role', ''))) = 'admin'
      AND (
        EXISTS (SELECT 1 FROM public.team_art_posts p WHERE p.user_id = u.id)
        OR EXISTS (SELECT 1 FROM public.team_art_comments c WHERE c.user_id = u.id)
      )
  ), resolved AS (
    SELECT * FROM mapped_masters
    UNION ALL
    SELECT * FROM mapped_players
  )
  SELECT DISTINCT ON (resolved.user_id)
    resolved.user_id, resolved.player_name, resolved.character_name, resolved.is_gm
  FROM resolved
  ORDER BY resolved.user_id, resolved.is_gm DESC
$$;

ALTER FUNCTION public.team_art_author_display_names(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_art_author_display_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_art_author_display_names(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

