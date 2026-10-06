-- Campaign NPC directory, ratings/comments, and a dedicated master-art tab.
-- Run after migration_shared_gm_permissions.sql, migration_team_art_board.sql,
-- migration_team_art_character_tags.sql, and migration_team_art_all_users_read.sql.

CREATE TABLE IF NOT EXISTS public.scenario_npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  scenario_step integer NOT NULL CHECK (scenario_step >= 1),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  age text NOT NULL DEFAULT '',
  gender text NOT NULL DEFAULT '',
  token_url text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenario_npcs_campaign_step_idx
  ON public.scenario_npcs(campaign_id, scenario_step, name);

ALTER TABLE public.scenario_npcs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scenario_npcs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenario_npcs TO authenticated;
DROP POLICY IF EXISTS scenario_npcs_read ON public.scenario_npcs;
CREATE POLICY scenario_npcs_read ON public.scenario_npcs
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR EXISTS (
      SELECT 1
      FROM public.player_character_context() pc
      JOIN public.teams viewer_team ON viewer_team.id = pc.team_id
      WHERE pc.campaign_id = scenario_npcs.campaign_id
        AND scenario_npcs.scenario_step < COALESCE(viewer_team.progress_step, 1)
    )
  );
DROP POLICY IF EXISTS scenario_npcs_master_insert ON public.scenario_npcs;
CREATE POLICY scenario_npcs_master_insert ON public.scenario_npcs
  FOR INSERT TO authenticated WITH CHECK (
    public.current_user_is_gm() AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS scenario_npcs_master_update ON public.scenario_npcs;
CREATE POLICY scenario_npcs_master_update ON public.scenario_npcs
  FOR UPDATE TO authenticated USING (public.current_user_is_gm())
  WITH CHECK (public.current_user_is_gm());
DROP POLICY IF EXISTS scenario_npcs_master_delete ON public.scenario_npcs;
CREATE POLICY scenario_npcs_master_delete ON public.scenario_npcs
  FOR DELETE TO authenticated USING (public.current_user_is_gm());

CREATE TABLE IF NOT EXISTS public.scenario_npc_ratings (
  npc_id uuid NOT NULL REFERENCES public.scenario_npcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (npc_id, user_id)
);
ALTER TABLE public.scenario_npc_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scenario_npc_ratings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scenario_npc_ratings TO authenticated;
DROP POLICY IF EXISTS scenario_npc_ratings_read ON public.scenario_npc_ratings;
CREATE POLICY scenario_npc_ratings_read ON public.scenario_npc_ratings
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.scenario_npcs n
    WHERE n.id = npc_id
      AND (public.current_user_is_gm()
        OR n.campaign_id IN (SELECT pc.campaign_id FROM public.player_character_context() pc))
  ));
DROP POLICY IF EXISTS scenario_npc_ratings_write_own ON public.scenario_npc_ratings;
CREATE POLICY scenario_npc_ratings_write_own ON public.scenario_npc_ratings
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.scenario_npcs n
      WHERE n.id = npc_id
        AND (public.current_user_is_gm()
          OR n.campaign_id IN (SELECT pc.campaign_id FROM public.player_character_context() pc))
    )
  );
DROP POLICY IF EXISTS scenario_npc_ratings_update_own ON public.scenario_npc_ratings;
CREATE POLICY scenario_npc_ratings_update_own ON public.scenario_npc_ratings
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.scenario_npcs n
    WHERE n.id = npc_id
      AND (public.current_user_is_gm()
        OR n.campaign_id IN (SELECT pc.campaign_id FROM public.player_character_context() pc))
  ));

CREATE TABLE IF NOT EXISTS public.scenario_npc_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL REFERENCES public.scenario_npcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL DEFAULT '사용자',
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenario_npc_comments_npc_created_idx
  ON public.scenario_npc_comments(npc_id, created_at);
ALTER TABLE public.scenario_npc_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scenario_npc_comments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.scenario_npc_comments TO authenticated;
DROP POLICY IF EXISTS scenario_npc_comments_read ON public.scenario_npc_comments;
CREATE POLICY scenario_npc_comments_read ON public.scenario_npc_comments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.scenario_npcs n
    WHERE n.id = npc_id
      AND (public.current_user_is_gm()
        OR n.campaign_id IN (SELECT pc.campaign_id FROM public.player_character_context() pc))
  ));
DROP POLICY IF EXISTS scenario_npc_comments_insert_own ON public.scenario_npc_comments;
CREATE POLICY scenario_npc_comments_insert_own ON public.scenario_npc_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.scenario_npcs n
      WHERE n.id = npc_id
        AND (public.current_user_is_gm()
          OR n.campaign_id IN (SELECT pc.campaign_id FROM public.player_character_context() pc))
    )
  );

CREATE OR REPLACE FUNCTION public.set_scenario_npc_comment_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  metadata jsonb;
BEGIN
  SELECT * INTO auth_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid comment author';
  END IF;
  metadata := COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb);
  NEW.nickname := COALESCE(
    NULLIF(metadata->>'nickname', ''),
    NULLIF(metadata->>'name', ''),
    NULLIF(metadata->>'full_name', ''),
    split_part(COALESCE(auth_user.email, 'user'), '@', 1)
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.set_scenario_npc_comment_author() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_scenario_npc_comment_author() FROM PUBLIC;
DROP TRIGGER IF EXISTS scenario_npc_comments_set_author ON public.scenario_npc_comments;
CREATE TRIGGER scenario_npc_comments_set_author
  BEFORE INSERT ON public.scenario_npc_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_scenario_npc_comment_author();

ALTER TABLE public.team_art_posts
  ADD COLUMN IF NOT EXISTS is_master_artwork boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS team_art_posts_master_created_idx
  ON public.team_art_posts(created_at DESC) WHERE is_master_artwork;
GRANT UPDATE (is_master_artwork) ON public.team_art_posts TO authenticated;
-- Preserve the shared artwork view, including posts without a team_id.
DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS team_art_comments_read ON public.team_art_comments;
CREATE POLICY team_art_comments_read ON public.team_art_comments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS team_art_posts_insert ON public.team_art_posts;
CREATE POLICY team_art_posts_insert ON public.team_art_posts
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        is_master_artwork
        AND public.current_user_is_gm()
        AND team_id IS NULL
      )
      OR (
        NOT is_master_artwork
        AND team_id IS NOT NULL
        AND (
          public.current_user_is_gm()
          OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
        )
      )
    )
  );

-- Let authenticated players tag manager accounts as well as characters on
-- their own team. All other cross-team tags remain blocked by the trigger.
CREATE OR REPLACE FUNCTION public.player_team_art_master_tag_targets()
RETURNS TABLE(id uuid, label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT public.current_user_is_gm()
     AND NOT EXISTS (SELECT 1 FROM public.player_character_context()) THEN
    RAISE EXCEPTION 'Not authorized to list master tag targets';
  END IF;

  RETURN QUERY
  SELECT u.id,
    COALESCE(NULLIF(u.username, ''), NULLIF(u.character_name, ''), '마스터')
  FROM public.users u
  WHERE lower(btrim(COALESCE(to_jsonb(u)->>'role', ''))) = 'admin'
  ORDER BY u.username NULLS LAST, u.id;
END;
$$;
ALTER FUNCTION public.player_team_art_master_tag_targets() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.player_team_art_master_tag_targets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_art_master_tag_targets() TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_team_art_character_tags()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  own_team_id uuid;
  invalid_tag_count integer;
BEGIN
  IF NEW.character_tags IS NULL THEN NEW.character_tags := '{}'; END IF;
  IF cardinality(NEW.character_tags) > 50 THEN
    RAISE EXCEPTION 'A post can mention at most 50 characters';
  END IF;

  SELECT count(*) INTO invalid_tag_count
  FROM unnest(NEW.character_tags) AS tags(tag_id)
  WHERE tags.tag_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = tags.tag_id);
  IF invalid_tag_count > 0 THEN
    RAISE EXCEPTION 'One or more tagged characters do not exist';
  END IF;

  IF NOT public.current_user_is_gm() THEN
    SELECT pc.team_id INTO own_team_id
    FROM public.player_character_context() pc
    LIMIT 1;
    IF own_team_id IS NULL OR NEW.team_id IS DISTINCT FROM own_team_id THEN
      RAISE EXCEPTION 'Players may tag characters only on their own team posts';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(NEW.character_tags) AS tags(tag_id)
      JOIN public.users u ON u.id = tags.tag_id
      WHERE u.team_id IS DISTINCT FROM own_team_id
        AND lower(btrim(COALESCE(to_jsonb(u)->>'role', ''))) <> 'admin'
    ) THEN
      RAISE EXCEPTION 'Players may tag only own-team characters or a master';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.validate_team_art_character_tags() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_team_art_character_tags() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
