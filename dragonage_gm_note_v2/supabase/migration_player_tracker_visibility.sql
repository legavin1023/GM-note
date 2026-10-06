-- progress_step is the player's current scenario position. Scenario definitions
-- strictly before it are visible; completed team_scenarios rows determine
-- which teams' choices are returned by the tracker policies below.

CREATE OR REPLACE FUNCTION public.player_visible_tracker_limit()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(COALESCE(t.progress_step, 1) - 1, 0)
  FROM public.teams t
  JOIN public.player_team_context() pc ON pc.team_id = t.id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.player_visible_tracker_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_visible_tracker_limit() TO authenticated;

-- Read the player's completion state under SECURITY DEFINER. In particular,
-- the team_scenarios SELECT policy must not query team_scenarios directly,
-- or PostgreSQL recursively evaluates that same policy.
CREATE OR REPLACE FUNCTION public.player_team_completed_stage(p_step_number integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_step_number IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.player_team_context() pc
    JOIN public.team_scenarios own_record ON own_record.team_id = pc.team_id
    WHERE own_record.step_number = p_step_number
      AND own_record.completed
  )
$$;
REVOKE ALL ON FUNCTION public.player_team_completed_stage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_completed_stage(integer) TO authenticated;

-- Scenario definitions are visible only strictly before the team's current
-- progress_step. The step is matched to the scenario's campaign ordering.
CREATE OR REPLACE FUNCTION public.player_can_view_completed_scenario(
  p_scenario_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    WITH viewer AS (
      SELECT pc.team_id, pc.campaign_id, COALESCE(t.progress_step, 1) AS progress_step
      FROM public.player_team_context() pc
      JOIN public.teams t ON t.id = pc.team_id
    ), ranked_scenarios AS (
      SELECT s.id, s.campaign_id,
        row_number() OVER (
          PARTITION BY s.campaign_id
          ORDER BY s.sort_order NULLS LAST, s.id
        ) AS scenario_step
      FROM public.scenarios s
      JOIN viewer v ON v.campaign_id = s.campaign_id
    )
    SELECT 1
    FROM viewer v
    JOIN ranked_scenarios s ON s.campaign_id = v.campaign_id
    WHERE s.id = p_scenario_id
      AND s.scenario_step <= GREATEST(v.progress_step - 1, 0)
  )
$$;
REVOKE ALL ON FUNCTION public.player_can_view_completed_scenario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_can_view_completed_scenario(uuid) TO authenticated;

DROP POLICY IF EXISTS "scenarios_player_completed_prior_read" ON public.scenarios;
CREATE POLICY "scenarios_player_completed_prior_read" ON public.scenarios
FOR SELECT TO authenticated
USING (
  NOT EXISTS (SELECT 1 FROM public.player_team_context())
  OR public.player_can_view_completed_scenario(id)
);

DROP POLICY IF EXISTS "teams_player_read" ON public.teams;
CREATE POLICY "teams_player_read" ON public.teams FOR SELECT TO authenticated
USING (campaign_id IN (SELECT campaign_id FROM public.player_team_context()));

DROP POLICY IF EXISTS "progress_stages_player_and_gm_read" ON public.progress_stages;
CREATE POLICY "progress_stages_player_and_gm_read" ON public.progress_stages
FOR SELECT TO authenticated
USING (
  NOT EXISTS (SELECT 1 FROM public.player_team_context())
  OR (
    progress_stages.step_number >= 1
    AND progress_stages.step_number <= public.player_visible_tracker_limit()
    AND public.player_team_completed_stage(progress_stages.step_number)
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
    AND public.player_team_completed_stage(scenario_questions.step_number)
  )
  OR (
    scenario_id IS NOT NULL
    AND public.player_can_view_completed_scenario(scenario_id)
  )
);

DROP POLICY IF EXISTS "team_scenarios_player_team" ON public.team_scenarios;
CREATE POLICY "team_scenarios_player_team" ON public.team_scenarios
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.player_team_context() pc
    JOIN public.teams record_team ON record_team.id = team_scenarios.team_id
    WHERE team_scenarios.completed
      AND (
        (
          team_scenarios.step_number IS NOT NULL
          AND team_scenarios.step_number >= 1
          AND team_scenarios.step_number <= public.player_visible_tracker_limit()
          AND record_team.campaign_id = pc.campaign_id
          AND public.player_team_completed_stage(team_scenarios.step_number)
        )
        OR (
          team_scenarios.scenario_id IS NOT NULL
          AND record_team.campaign_id = pc.campaign_id
          AND public.player_can_view_completed_scenario(team_scenarios.scenario_id)
        )
      )
  )
);

DROP POLICY IF EXISTS "team_scenario_answers_player_team" ON public.team_scenario_answers;
CREATE POLICY "team_scenario_answers_player_team" ON public.team_scenario_answers
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.player_team_context() pc ON pc.team_id = t.id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.completed
    AND (
      (
        ts.step_number IS NOT NULL
        AND ts.step_number >= 1
        AND ts.step_number <= public.player_visible_tracker_limit()
        AND q.scenario_id IS NULL
        AND q.step_number = ts.step_number
      )
      OR (
        q.scenario_id IS NOT NULL
        AND q.scenario_id = ts.scenario_id
        AND public.player_can_view_completed_scenario(ts.scenario_id)
      )
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.team_scenarios ts
  JOIN public.teams t ON t.id = ts.team_id
  JOIN public.player_team_context() pc ON pc.team_id = t.id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE ts.id = team_scenario_answers.team_scenario_id
    AND ts.completed
    AND (
      (
        ts.step_number IS NOT NULL
        AND ts.step_number >= 1
        AND ts.step_number <= public.player_visible_tracker_limit()
        AND q.scenario_id IS NULL
        AND q.step_number = ts.step_number
      )
      OR (
        q.scenario_id IS NOT NULL
        AND q.scenario_id = ts.scenario_id
        AND public.player_can_view_completed_scenario(ts.scenario_id)
      )
    )
));

DROP POLICY IF EXISTS "team_scenario_answers_player_completed_prior_read" ON public.team_scenario_answers;
CREATE POLICY "team_scenario_answers_player_completed_prior_read"
ON public.team_scenario_answers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.team_scenarios record
  JOIN public.teams answer_team ON answer_team.id = record.team_id
  JOIN public.player_team_context() pc ON pc.campaign_id = answer_team.campaign_id
  JOIN public.scenario_questions q ON q.id = team_scenario_answers.question_id
  WHERE record.id = team_scenario_answers.team_scenario_id
    AND record.completed
    AND (
      (
        record.step_number IS NOT NULL
        AND record.step_number >= 1
        AND record.step_number <= public.player_visible_tracker_limit()
        AND q.scenario_id IS NULL
        AND q.step_number = record.step_number
        AND public.player_team_completed_stage(record.step_number)
      )
      OR (
        q.scenario_id IS NOT NULL
        AND q.scenario_id = record.scenario_id
        AND public.player_can_view_completed_scenario(record.scenario_id)
      )
    )
));

GRANT SELECT ON public.teams TO authenticated;
GRANT SELECT ON public.team_scenarios TO authenticated;
GRANT SELECT ON public.team_scenario_answers TO authenticated;

NOTIFY pgrst, 'reload schema';
