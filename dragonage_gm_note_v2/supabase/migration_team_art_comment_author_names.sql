-- Store character names and token images on artwork posts/comments instead of
-- synthetic player-<uuid> Auth email names. Apply after
-- migration_team_art_profile_avatars.sql.

CREATE OR REPLACE FUNCTION public.set_free_board_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  profile public.users%ROWTYPE;
  metadata jsonb;
  is_master boolean;
  metadata_name text;
BEGIN
  SELECT * INTO auth_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid board author';
  END IF;

  is_master := public.current_user_is_gm();
  IF is_master THEN
    SELECT u.* INTO profile FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
    NEW.nickname := COALESCE(
      NULLIF(btrim(profile.username), ''),
      NULLIF(btrim(profile.character_name), ''),
      '마스터'
    );
    NEW.avatar_url := NULLIF(btrim(profile.token_url), '');
  ELSE
    SELECT u.* INTO profile
    FROM public.player_team_members m
    JOIN public.users u ON u.username = m.login_username
    WHERE m.user_id = auth.uid()
    ORDER BY u.created_at NULLS LAST
    LIMIT 1;
    IF FOUND THEN
      NEW.nickname := COALESCE(
        NULLIF(btrim(profile.character_name), ''),
        NULLIF(btrim(profile.player), ''),
        '플레이어'
      );
      NEW.avatar_url := NULLIF(btrim(profile.token_url), '');
    ELSE
      metadata := COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb);
      metadata_name := COALESCE(
        NULLIF(btrim(metadata->>'nickname'), ''),
        NULLIF(btrim(metadata->>'name'), ''),
        NULLIF(btrim(metadata->>'full_name'), '')
      );
      IF metadata_name ~* '^player-[0-9a-f-]{36}$' THEN metadata_name := NULL; END IF;
      NEW.nickname := COALESCE(metadata_name, '플레이어');
      NEW.avatar_url := COALESCE(
        NULLIF(metadata->>'avatar_url', ''), NULLIF(metadata->>'picture', '')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.set_free_board_author() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_free_board_author() FROM PUBLIC;

-- Existing comments/posts keep their original IDs, but replace synthetic
-- author labels with the linked character and token image.
UPDATE public.team_art_comments c
SET nickname = COALESCE(NULLIF(btrim(u.character_name), ''), NULLIF(btrim(u.player), ''), '플레이어'),
    avatar_url = NULLIF(btrim(u.token_url), '')
FROM public.player_team_members m
JOIN public.users u ON u.username = m.login_username
WHERE m.user_id = c.user_id
  AND c.nickname ~* '^player-[0-9a-f-]{36}$';

UPDATE public.team_art_posts p
SET nickname = COALESCE(NULLIF(btrim(u.character_name), ''), NULLIF(btrim(u.player), ''), '플레이어'),
    avatar_url = NULLIF(btrim(u.token_url), '')
FROM public.player_team_members m
JOIN public.users u ON u.username = m.login_username
WHERE m.user_id = p.user_id
  AND p.nickname ~* '^player-[0-9a-f-]{36}$';

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
      COALESCE(NULLIF(btrim(u.player), ''), NULLIF(btrim(u.username), ''), '플레이어') AS player_name,
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
    SELECT u.id AS user_id, '마스터'::text AS player_name,
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
