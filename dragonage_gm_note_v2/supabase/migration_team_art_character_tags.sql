-- Add character mentions to team artwork posts.
-- Run after migration_team_art_board.sql and migration_player_team_assets.sql.

ALTER TABLE public.team_art_posts
  ADD COLUMN IF NOT EXISTS character_tags uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS team_art_posts_character_tags_gin
  ON public.team_art_posts USING gin(character_tags);

GRANT UPDATE (character_tags) ON public.team_art_posts TO authenticated;

-- Players may see their own team's posts plus any post that explicitly tags
-- their character. The tag filter therefore remains useful across teams.
DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR team_id IN (SELECT team_id FROM public.player_character_context())
    OR EXISTS (
      SELECT 1
      FROM public.player_character_context() pc
      WHERE pc.character_id = ANY(character_tags)
    )
  );

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
  IF NEW.character_tags IS NULL THEN
    NEW.character_tags := '{}';
  END IF;

  IF cardinality(NEW.character_tags) > 50 THEN
    RAISE EXCEPTION 'A post can mention at most 50 characters';
  END IF;

  SELECT count(*) INTO invalid_tag_count
  FROM unnest(NEW.character_tags) AS tags(tag_id)
  WHERE tags.tag_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.users u WHERE u.id = tags.tag_id
     );
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
    ) THEN
      RAISE EXCEPTION 'Players may tag only characters on their own team';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.validate_team_art_character_tags() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_team_art_character_tags() FROM PUBLIC;

DROP TRIGGER IF EXISTS team_art_posts_validate_character_tags
  ON public.team_art_posts;
CREATE TRIGGER team_art_posts_validate_character_tags
  BEFORE INSERT OR UPDATE ON public.team_art_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_art_character_tags();

NOTIFY pgrst, 'reload schema';
