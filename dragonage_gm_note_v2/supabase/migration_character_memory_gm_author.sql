-- Allow GMs to author character memory notes as "마스터" instead of having
-- to choose a player character. Run after migration_character_memory_notes.sql.

ALTER TABLE public.scenario_character_notes
  ALTER COLUMN author_character_id DROP NOT NULL;
ALTER TABLE public.party_character_notes
  ALTER COLUMN author_character_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_character_memory_note()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  target_campaign_id uuid;
  writer_team_id uuid;
  writer_character_id uuid;
  writer_character_name text;
  target_character_name text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
       OR NEW.author_character_id IS DISTINCT FROM OLD.author_character_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      RAISE EXCEPTION 'Note author and team cannot be changed';
    END IF;
  ELSIF NEW.author_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Note author must be the signed-in user';
  END IF;

  SELECT t.campaign_id INTO target_campaign_id
  FROM public.teams t WHERE t.id = NEW.team_id;
  IF target_campaign_id IS NULL THEN RAISE EXCEPTION 'Team not found'; END IF;

  IF NOT public.current_user_is_gm() THEN
    SELECT pc.team_id, pc.character_id INTO writer_team_id, writer_character_id
    FROM public.player_character_context() pc LIMIT 1;
    IF writer_team_id IS DISTINCT FROM NEW.team_id
       OR writer_character_id IS DISTINCT FROM NEW.author_character_id THEN
      RAISE EXCEPTION 'Players may write only as their assigned character in their own team';
    END IF;
  END IF;

  IF NEW.author_character_id IS NULL THEN
    IF NOT public.current_user_is_gm() THEN
      RAISE EXCEPTION 'Only a GM may write as the master';
    END IF;
    NEW.author_character_name := '마스터';
  ELSE
    SELECT u.character_name INTO writer_character_name
    FROM public.users u
    WHERE u.id = NEW.author_character_id AND u.team_id = NEW.team_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Author character must belong to the selected team';
    END IF;
    NEW.author_character_name := COALESCE(NULLIF(writer_character_name, ''), '캐릭터');
  END IF;

  SELECT u.character_name INTO target_character_name
  FROM public.users u
  WHERE u.id = NEW.target_character_id AND u.team_id = NEW.team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target character must belong to the selected team';
  END IF;
  NEW.target_character_name := COALESCE(NULLIF(target_character_name, ''), '캐릭터');

  IF TG_TABLE_NAME = 'scenario_character_notes' THEN
    IF NEW.scenario_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.scenarios s
      WHERE s.id = NEW.scenario_id AND s.campaign_id = target_campaign_id
    ) THEN
      RAISE EXCEPTION 'Scenario must belong to the team campaign';
    END IF;
    IF NEW.step_number IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.progress_stages ps WHERE ps.step_number = NEW.step_number
    ) THEN
      RAISE EXCEPTION 'Progress stage not found';
    END IF;
  ELSIF NEW.scenario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = NEW.scenario_id AND s.campaign_id = target_campaign_id
  ) THEN
    RAISE EXCEPTION 'Scenario must belong to the team campaign';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.validate_character_memory_note() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_character_memory_note() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
