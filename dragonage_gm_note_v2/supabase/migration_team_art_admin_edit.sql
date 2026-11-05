-- Apply after migration_npc_lore_and_master_art.sql and other character-tag migrations.
-- Allows trusted Dashboard/SQL and service-role maintenance; retains player restrictions.
BEGIN;
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

  -- SECURITY DEFINER changes current_user; session_user identifies the DB session.
  -- Missing auth.uid alone must never grant an anonymous client admin access.
  IF NOT (
    public.current_user_is_gm()
    OR COALESCE(auth.role() = 'service_role', false)
    OR (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin'))
  ) THEN
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
COMMIT;

