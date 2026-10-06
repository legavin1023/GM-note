-- Player access. Run after migration_v2.sql in the Supabase SQL editor.
-- Connect Auth identities to existing public.users usernames. Team scope comes
-- from public.users.team_id rather than a second team assignment.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS character_quirk text,
  ADD COLUMN IF NOT EXISTS character_name text NOT NULL DEFAULT '';
ALTER TABLE public.scenario_questions
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS step_number integer;

CREATE TABLE IF NOT EXISTS public.player_team_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  login_username text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_team_members
  ADD COLUMN IF NOT EXISTS login_username text;
-- Team membership already lives on public.users.team_id. Keep the legacy
-- column nullable for databases that ran an earlier revision, but derive the
-- player's team from the username's existing character rows below.
ALTER TABLE public.player_team_members
  ALTER COLUMN team_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS player_team_members_login_username_key
  ON public.player_team_members(login_username) WHERE login_username IS NOT NULL;
ALTER TABLE public.player_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_team_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.player_team_context()
RETURNS TABLE(team_id uuid, campaign_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT t.id, t.campaign_id
  FROM public.player_team_members m
  JOIN public.users u ON u.username = m.login_username
  JOIN public.teams t ON t.id = u.team_id
  WHERE m.user_id = auth.uid()
    AND u.team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users other_user
      WHERE other_user.username = m.login_username
        AND other_user.team_id IS DISTINCT FROM u.team_id
    )
  ORDER BY u.created_at NULLS LAST
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.player_team_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_context() TO authenticated;

-- Team metadata is needed to render the player's own workspace.
DROP POLICY IF EXISTS "teams_player_read" ON public.teams;
CREATE POLICY "teams_player_read" ON public.teams FOR SELECT TO authenticated
USING (id IN (SELECT team_id FROM public.player_team_context()));

DROP POLICY IF EXISTS "progress_stages_auth_read" ON public.progress_stages;
CREATE POLICY "progress_stages_player_and_gm_read" ON public.progress_stages FOR SELECT TO authenticated
USING (
  NOT EXISTS (SELECT 1 FROM public.player_team_context())
  OR EXISTS (
    SELECT 1 FROM public.player_team_context() pc
    JOIN public.teams t ON t.id = pc.team_id
    JOIN public.team_scenarios ts ON ts.team_id = t.id
      AND ts.step_number = progress_stages.step_number AND ts.completed
    WHERE progress_stages.step_number < COALESCE(t.progress_step, 1)
  )
);

-- Stage prompts are visible only after the player's team has completed them
-- and moved beyond that stage. Keep GM ownership access intact.
DROP POLICY IF EXISTS "scenarios_player_read" ON public.scenarios;
DROP POLICY IF EXISTS "scenario_questions_player_read" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_select_owned_or_scenario" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_owner_all" ON public.scenario_questions;
CREATE POLICY "scenario_questions_player_and_gm_read" ON public.scenario_questions FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR scenario_id IN (SELECT s.id FROM public.scenarios s JOIN public.campaigns c ON c.id = s.campaign_id WHERE c.owner_id = auth.uid())
  OR (owner_id IS NULL AND scenario_id IS NULL AND step_number IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.player_team_context()))
  OR (scenario_id IS NULL AND step_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.player_team_context() pc
    JOIN public.teams t ON t.id = pc.team_id
    JOIN public.team_scenarios ts ON ts.team_id = t.id AND ts.step_number = scenario_questions.step_number AND ts.completed
    WHERE scenario_questions.step_number < COALESCE(t.progress_step, 1)
  ))
);
DROP POLICY IF EXISTS "question_choices_player_read" ON public.question_choices;
DROP POLICY IF EXISTS "question_choices_select_owned_or_legacy_stage" ON public.question_choices;
DROP POLICY IF EXISTS "question_choices_owner_all" ON public.question_choices;
CREATE POLICY "question_choices_player_and_gm_read" ON public.question_choices FOR SELECT TO authenticated
USING (question_id IN (SELECT q.id FROM public.scenario_questions q));

-- Players can see their own progress records, but cannot change completion state.
DROP POLICY IF EXISTS "team_scenarios_player_team" ON public.team_scenarios;
CREATE POLICY "team_scenarios_player_team" ON public.team_scenarios FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM public.player_team_context()));
DROP POLICY IF EXISTS "team_scenarios_player_update" ON public.team_scenarios;
REVOKE INSERT, UPDATE, DELETE ON public.team_scenarios FROM authenticated;
GRANT SELECT ON public.team_scenarios TO authenticated;
GRANT INSERT (team_id, scenario_id, step_number, completed), UPDATE (completed, updated_at)
  ON public.team_scenarios TO authenticated;

-- GM notes cannot be protected by row-level policies when players may read
-- their team's tracker rows, so keep them in a separate GM-only table.
CREATE TABLE IF NOT EXISTS public.team_scenario_gm_notes (
  team_scenario_id uuid PRIMARY KEY REFERENCES public.team_scenarios(id) ON DELETE CASCADE,
  gm_note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_scenarios' AND column_name = 'gm_note') THEN
    INSERT INTO public.team_scenario_gm_notes(team_scenario_id, gm_note, updated_at)
    SELECT id, gm_note, COALESCE(updated_at, now())
    FROM public.team_scenarios
    WHERE NULLIF(gm_note, '') IS NOT NULL
    ON CONFLICT (team_scenario_id) DO UPDATE
    SET gm_note = EXCLUDED.gm_note, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;
ALTER TABLE public.team_scenario_gm_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_scenario_gm_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_scenario_gm_notes TO authenticated;
DROP POLICY IF EXISTS "team_scenario_gm_notes_owner_all" ON public.team_scenario_gm_notes;
CREATE POLICY "team_scenario_gm_notes_owner_all" ON public.team_scenario_gm_notes FOR ALL TO authenticated
USING (team_scenario_id IN (
  SELECT ts.id FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE c.owner_id = auth.uid()
))
WITH CHECK (team_scenario_id IN (
  SELECT ts.id FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE c.owner_id = auth.uid()
));
ALTER TABLE public.team_scenarios DROP COLUMN IF EXISTS gm_note;

DROP POLICY IF EXISTS "team_scenario_answers_player_team" ON public.team_scenario_answers;
CREATE POLICY "team_scenario_answers_player_team" ON public.team_scenario_answers FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.player_team_context() pc ON pc.team_id = t.id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.completed AND ts.step_number IS NOT NULL
    AND ts.step_number < COALESCE(t.progress_step, 1)
    AND q.scenario_id IS NULL AND q.step_number = ts.step_number
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.player_team_context() pc ON pc.team_id = t.id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.completed AND ts.step_number IS NOT NULL
    AND ts.step_number < COALESCE(t.progress_step, 1)
    AND q.scenario_id IS NULL AND q.step_number = ts.step_number
));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_scenario_answers TO authenticated;

-- Expose non-secret character fields through a narrowly scoped RPC. Do not grant
-- direct users-table access to players: it contains GM-only notes and secrets.
DROP FUNCTION IF EXISTS public.player_team_profiles();
CREATE OR REPLACE FUNCTION public.player_team_profiles()
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'team_id', u.team_id,
    'character_name', u.character_name, 'player', u.player,
    'token_url', u.token_url, 'level', u.level, 'age', u.age, 'height', u.height,
    'weight', u.weight, 'race', u.race, 'background', u.background,
    'social_class', u.social_class, 'class', u.class, 'motivation', u.motivation,
    'goal', u.goal, 'strengths', u.strengths,
    'languages', u.languages, 'traits', u.traits,
    'character_quirk', u.character_quirk, 'biography', u.biography
  )
  FROM public.users u
  WHERE u.team_id IN (SELECT team_id FROM public.player_team_context())
$$;
REVOKE ALL ON FUNCTION public.player_team_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_profiles() TO authenticated;

NOTIFY pgrst, 'reload schema';
