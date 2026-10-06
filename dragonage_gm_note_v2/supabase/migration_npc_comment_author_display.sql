-- Show the linked character name (or master username) on NPC comments instead
-- of leaking the synthetic player-<uuid> Auth email local-part.
-- Apply after migration_npc_lore_and_master_art.sql.

ALTER TABLE public.scenario_npc_comments
  ADD COLUMN IF NOT EXISTS author_player_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS author_character_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS author_token_url text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.set_scenario_npc_comment_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  metadata jsonb;
  display_name text;
  is_master boolean;
  player_name text;
  character_name text;
  character_token_url text;
BEGIN
  SELECT * INTO auth_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid comment author';
  END IF;

  is_master := public.current_user_is_gm();
  IF is_master THEN
    SELECT COALESCE(NULLIF(u.username, ''), NULLIF(u.character_name, '')),
      COALESCE(NULLIF(u.character_name, ''), '마스터'),
      COALESCE(NULLIF(u.token_url, ''), '')
      INTO display_name, character_name, character_token_url
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1;
    player_name := '마스터';
  ELSE
    SELECT COALESCE(NULLIF(u.player, ''), NULLIF(u.username, '')),
      COALESCE(NULLIF(u.character_name, ''), '캐릭터'),
      COALESCE(NULLIF(u.token_url, ''), '')
      INTO player_name, character_name, character_token_url
    FROM public.player_team_members m
    JOIN public.users u ON u.username = m.login_username
    WHERE m.user_id = auth.uid()
    ORDER BY u.created_at NULLS LAST
    LIMIT 1;
    display_name := character_name;
  END IF;

  metadata := COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb);
  NEW.nickname := COALESCE(
    NULLIF(btrim(display_name), ''),
    NULLIF(btrim(metadata->>'nickname'), ''),
    NULLIF(btrim(metadata->>'name'), ''),
    NULLIF(btrim(metadata->>'full_name'), ''),
    CASE WHEN is_master THEN '마스터' ELSE '플레이어' END
  );
  NEW.author_player_name := COALESCE(NULLIF(btrim(player_name), ''),
    CASE WHEN is_master THEN '마스터' ELSE '플레이어' END);
  NEW.author_character_name := COALESCE(NULLIF(btrim(character_name), ''),
    CASE WHEN is_master THEN '마스터' ELSE '캐릭터' END);
  NEW.author_token_url := COALESCE(character_token_url, '');
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_scenario_npc_comment_author() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_scenario_npc_comment_author() FROM PUBLIC;

DROP TRIGGER IF EXISTS scenario_npc_comments_set_author
  ON public.scenario_npc_comments;
CREATE TRIGGER scenario_npc_comments_set_author
  BEFORE INSERT ON public.scenario_npc_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_scenario_npc_comment_author();

-- Fill display data for comments written before this migration.
UPDATE public.scenario_npc_comments c
SET author_player_name = COALESCE(NULLIF(u.player, ''), NULLIF(u.username, ''), '플레이어'),
    author_character_name = COALESCE(NULLIF(u.character_name, ''), '캐릭터'),
    author_token_url = COALESCE(NULLIF(u.token_url, ''), '')
FROM public.player_team_members m
JOIN public.users u ON u.username = m.login_username
WHERE m.user_id = c.user_id
  AND (c.author_character_name = '' OR c.author_token_url = '');

UPDATE public.scenario_npc_comments c
SET author_player_name = '마스터',
    author_character_name = COALESCE(NULLIF(u.character_name, ''), '마스터'),
    author_token_url = COALESCE(NULLIF(u.token_url, ''), '')
FROM public.users u
WHERE u.id = c.user_id
  AND lower(btrim(COALESCE(to_jsonb(u)->>'role', ''))) = 'admin'
  AND (c.author_character_name = '' OR c.author_token_url = '');

NOTIFY pgrst, 'reload schema';
