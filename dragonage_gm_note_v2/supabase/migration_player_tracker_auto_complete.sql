-- Let players edit earlier tracker stages for their own team. Mark every
-- tracker row before teams.progress_step complete automatically.
-- Run after migration_player_tracker_visibility.sql.

DROP POLICY IF EXISTS "progress_stages_player_and_gm_read" ON public.progress_stages;
CREATE POLICY "progress_stages_player_and_gm_read" ON public.progress_stages
FOR SELECT TO authenticated
USING (
  NOT EXISTS (SELECT 1 FROM public.player_team_context())
  OR (
    progress_stages.step_number >= 1
    AND progress_stages.step_number <= public.player_visible_tracker_limit()
  )
);

DROP POLICY IF EXISTS "scenario_questions_player_and_gm_read" ON public.scenario_questions;
CREATE POLICY "scenario_questions_player_and_gm_read" ON public.scenario_questions
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR scenario_id IN (
    SELECT s.id FROM public.scenarios s
    JOIN public.campaigns c ON c.id = s.campaign_id
    WHERE c.owner_id = auth.uid()
  )
  OR (
    owner_id IS NULL AND scenario_id IS NULL AND step_number IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.player_team_context())
  )
  OR (
    scenario_id IS NULL AND step_number IS NOT NULL
    AND step_number >= 1
    AND step_number <= public.player_visible_tracker_limit()
  )
  OR (
    scenario_id IS NOT NULL
    AND public.player_can_view_completed_scenario(scenario_id)
  )
);

-- Own incomplete rows are editable; other teams' rows remain complete-only.
DROP POLICY IF EXISTS "team_scenarios_player_team" ON public.team_scenarios;
CREATE POLICY "team_scenarios_player_team" ON public.team_scenarios
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.player_team_context() pc
  JOIN public.teams record_team ON record_team.id = team_scenarios.team_id
  WHERE team_scenarios.step_number >= 1
    AND team_scenarios.step_number <= public.player_visible_tracker_limit()
    AND record_team.campaign_id = pc.campaign_id
    AND (
      team_scenarios.team_id = pc.team_id
      OR team_scenarios.completed
    )
));

DROP POLICY IF EXISTS "team_scenario_answers_player_team" ON public.team_scenario_answers;
DROP POLICY IF EXISTS "team_scenario_answers_player_completed_prior_read" ON public.team_scenario_answers;
DROP POLICY IF EXISTS "team_scenario_answers_player_tracker_read" ON public.team_scenario_answers;
DROP POLICY IF EXISTS "team_scenario_answers_player_tracker_insert" ON public.team_scenario_answers;
DROP POLICY IF EXISTS "team_scenario_answers_player_tracker_update" ON public.team_scenario_answers;
DROP POLICY IF EXISTS "team_scenario_answers_player_tracker_delete" ON public.team_scenario_answers;

CREATE POLICY "team_scenario_answers_player_tracker_read"
ON public.team_scenario_answers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.team_scenarios ts
  JOIN public.teams record_team ON record_team.id = ts.team_id
  JOIN public.player_team_context() pc ON pc.campaign_id = record_team.campaign_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.step_number >= 1
    AND ts.step_number <= public.player_visible_tracker_limit()
    AND q.scenario_id IS NULL
    AND q.step_number = ts.step_number
    AND (ts.team_id = pc.team_id OR ts.completed)
));

CREATE POLICY "team_scenario_answers_player_tracker_insert"
ON public.team_scenario_answers FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.team_scenarios ts
  JOIN public.player_team_context() pc ON pc.team_id = ts.team_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.step_number >= 1
    AND ts.step_number <= public.player_visible_tracker_limit()
    AND q.scenario_id IS NULL
    AND q.step_number = ts.step_number
));

CREATE POLICY "team_scenario_answers_player_tracker_update"
ON public.team_scenario_answers FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.team_scenarios ts
  JOIN public.player_team_context() pc ON pc.team_id = ts.team_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.step_number >= 1
    AND ts.step_number <= public.player_visible_tracker_limit()
    AND q.scenario_id IS NULL
    AND q.step_number = ts.step_number
))
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.team_scenarios ts
  JOIN public.player_team_context() pc ON pc.team_id = ts.team_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.step_number >= 1
    AND ts.step_number <= public.player_visible_tracker_limit()
    AND q.scenario_id IS NULL
    AND q.step_number = ts.step_number
));

CREATE POLICY "team_scenario_answers_player_tracker_delete"
ON public.team_scenario_answers FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.team_scenarios ts
  JOIN public.player_team_context() pc ON pc.team_id = ts.team_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.step_number >= 1
    AND ts.step_number <= public.player_visible_tracker_limit()
    AND q.scenario_id IS NULL
    AND q.step_number = ts.step_number
));

-- Players may create an incomplete tracker row for their own prior stage.
DROP POLICY IF EXISTS "team_scenarios_player_prior_insert" ON public.team_scenarios;
CREATE POLICY "team_scenarios_player_prior_insert" ON public.team_scenarios
FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM public.player_team_context())
  AND step_number >= 1
  AND step_number <= public.player_visible_tracker_limit()
  AND scenario_id IS NULL
  AND completed = false
);

-- Remove the earlier answer-based completion trigger if that version was run.
DROP TRIGGER IF EXISTS team_scenario_answers_auto_complete_stage
  ON public.team_scenario_answers;
DROP FUNCTION IF EXISTS public.auto_complete_player_tracker_stage();

CREATE OR REPLACE FUNCTION public.complete_prior_team_tracker_rows()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.team_scenarios (team_id, step_number, completed)
  SELECT NEW.id, prior_stage.step_number, true
  FROM (
    SELECT DISTINCT ps.step_number
    FROM public.progress_stages ps
    WHERE ps.step_number >= 1
      AND ps.step_number < COALESCE(NEW.progress_step, 1)
  ) prior_stage
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.team_scenarios existing
    WHERE existing.team_id = NEW.id
      AND existing.step_number = prior_stage.step_number
  );

  UPDATE public.team_scenarios ts
  SET completed = true,
      updated_at = now()
  WHERE ts.team_id = NEW.id
    AND ts.step_number IS NOT NULL
    AND ts.step_number < COALESCE(NEW.progress_step, 1)
    AND ts.completed = false;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_prior_team_tracker_rows() FROM PUBLIC;

DROP TRIGGER IF EXISTS teams_progress_step_complete_prior_tracker
  ON public.teams;
CREATE TRIGGER teams_progress_step_complete_prior_tracker
AFTER UPDATE OF progress_step ON public.teams
FOR EACH ROW
WHEN (OLD.progress_step IS DISTINCT FROM NEW.progress_step)
EXECUTE FUNCTION public.complete_prior_team_tracker_rows();

CREATE OR REPLACE FUNCTION public.complete_new_prior_team_tracker_row()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.team_scenarios ts
  SET completed = true,
      updated_at = now()
  FROM public.teams t
  WHERE ts.id = NEW.id
    AND ts.team_id = t.id
    AND ts.step_number IS NOT NULL
    AND ts.step_number < COALESCE(t.progress_step, 1)
    AND ts.completed = false;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_new_prior_team_tracker_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS team_scenarios_complete_prior_on_insert
  ON public.team_scenarios;
CREATE TRIGGER team_scenarios_complete_prior_on_insert
AFTER INSERT ON public.team_scenarios
FOR EACH ROW EXECUTE FUNCTION public.complete_new_prior_team_tracker_row();

-- Backfill all existing tracker rows before each team's current progress.
INSERT INTO public.team_scenarios (team_id, step_number, completed)
SELECT t.id, prior_stage.step_number, true
FROM public.teams t
JOIN LATERAL (
  SELECT DISTINCT ps.step_number
  FROM public.progress_stages ps
  WHERE ps.step_number >= 1
    AND ps.step_number < COALESCE(t.progress_step, 1)
) prior_stage ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_scenarios existing
  WHERE existing.team_id = t.id
    AND existing.step_number = prior_stage.step_number
);

UPDATE public.team_scenarios ts
SET completed = true,
    updated_at = now()
FROM public.teams t
WHERE ts.team_id = t.id
  AND ts.step_number IS NOT NULL
  AND ts.step_number < COALESCE(t.progress_step, 1)
  AND ts.completed = false;

NOTIFY pgrst, 'reload schema';
