-- Scenario one-liners and party member notes.
-- Run after migration_player_access.sql, migration_player_team_assets.sql,
-- and migration_shared_gm_permissions.sql.

CREATE TABLE IF NOT EXISTS public.scenario_character_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE,
  step_number integer,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_character_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_character_name text NOT NULL DEFAULT '',
  target_character_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_character_name text NOT NULL DEFAULT '',
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 1200),
  is_public boolean NOT NULL DEFAULT false,
  show_author boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_character_notes_one_scenario CHECK (
    (scenario_id IS NOT NULL AND step_number IS NULL)
    OR (scenario_id IS NULL AND step_number IS NOT NULL AND step_number >= 1)
  )
);
CREATE INDEX IF NOT EXISTS scenario_character_notes_scenario_idx
  ON public.scenario_character_notes(scenario_id, created_at ASC);
CREATE INDEX IF NOT EXISTS scenario_character_notes_step_idx
  ON public.scenario_character_notes(step_number, created_at ASC);
CREATE INDEX IF NOT EXISTS scenario_character_notes_team_idx
  ON public.scenario_character_notes(team_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.party_character_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_character_name text NOT NULL DEFAULT '',
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_character_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_character_name text NOT NULL DEFAULT '',
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 1200),
  note_date date,
  scenario_id uuid REFERENCES public.scenarios(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('team', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_character_notes_target_idx
  ON public.party_character_notes(team_id, target_character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS party_character_notes_author_idx
  ON public.party_character_notes(author_user_id, created_at DESC);

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
  ELSE
    IF NEW.author_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Note author must be the signed-in user';
    END IF;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.author_character_id AND u.team_id = NEW.team_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.target_character_id AND u.team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'Author and target characters must belong to the selected team';
  END IF;

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

  SELECT u.character_name INTO writer_character_name
  FROM public.users u WHERE u.id = NEW.author_character_id;
  SELECT u.character_name INTO target_character_name
  FROM public.users u WHERE u.id = NEW.target_character_id;
  NEW.author_character_name := COALESCE(NULLIF(writer_character_name, ''), '캐릭터');
  NEW.target_character_name := COALESCE(NULLIF(target_character_name, ''), '캐릭터');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.validate_character_memory_note() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_character_memory_note() FROM PUBLIC;

DROP TRIGGER IF EXISTS scenario_character_notes_validate ON public.scenario_character_notes;
CREATE TRIGGER scenario_character_notes_validate
  BEFORE INSERT OR UPDATE ON public.scenario_character_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_character_memory_note();
DROP TRIGGER IF EXISTS party_character_notes_validate ON public.party_character_notes;
CREATE TRIGGER party_character_notes_validate
  BEFORE INSERT OR UPDATE ON public.party_character_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_character_memory_note();

ALTER TABLE public.scenario_character_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_character_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scenario_character_notes, public.party_character_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenario_character_notes, public.party_character_notes TO authenticated;

DROP POLICY IF EXISTS scenario_character_notes_read ON public.scenario_character_notes;
CREATE POLICY scenario_character_notes_read ON public.scenario_character_notes
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR is_public
    OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
  );
DROP POLICY IF EXISTS scenario_character_notes_insert ON public.scenario_character_notes;
CREATE POLICY scenario_character_notes_insert ON public.scenario_character_notes
  FOR INSERT TO authenticated WITH CHECK (
    author_user_id = auth.uid()
    AND (public.current_user_is_gm()
      OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc))
  );
DROP POLICY IF EXISTS scenario_character_notes_update ON public.scenario_character_notes;
CREATE POLICY scenario_character_notes_update ON public.scenario_character_notes
  FOR UPDATE TO authenticated USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());
DROP POLICY IF EXISTS scenario_character_notes_delete ON public.scenario_character_notes;
CREATE POLICY scenario_character_notes_delete ON public.scenario_character_notes
  FOR DELETE TO authenticated USING (author_user_id = auth.uid());

DROP POLICY IF EXISTS party_character_notes_read ON public.party_character_notes;
CREATE POLICY party_character_notes_read ON public.party_character_notes
  FOR SELECT TO authenticated USING (
    author_user_id = auth.uid()
    OR (visibility = 'team' AND (
      public.current_user_is_gm()
      OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
    ))
  );
DROP POLICY IF EXISTS party_character_notes_insert ON public.party_character_notes;
CREATE POLICY party_character_notes_insert ON public.party_character_notes
  FOR INSERT TO authenticated WITH CHECK (
    author_user_id = auth.uid()
    AND (public.current_user_is_gm()
      OR team_id IN (SELECT pc.team_id FROM public.player_character_context() pc))
  );
DROP POLICY IF EXISTS party_character_notes_update ON public.party_character_notes;
CREATE POLICY party_character_notes_update ON public.party_character_notes
  FOR UPDATE TO authenticated USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());
DROP POLICY IF EXISTS party_character_notes_delete ON public.party_character_notes;
CREATE POLICY party_character_notes_delete ON public.party_character_notes
  FOR DELETE TO authenticated USING (author_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
