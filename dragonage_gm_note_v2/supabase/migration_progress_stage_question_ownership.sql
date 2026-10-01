-- Allow authenticated GMs to manage only their own progress-stage questions.
-- Run in the Supabase SQL Editor after migration_v2.sql.

ALTER TABLE public.scenario_questions
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- The progress-stage question UI stores a stage number on these rows.
ALTER TABLE public.scenario_questions
  ADD COLUMN IF NOT EXISTS step_number integer;

DROP POLICY IF EXISTS "scenario_questions_owner_all" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_select_owned_or_scenario" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_insert_owned_or_scenario" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_update_owned_or_scenario" ON public.scenario_questions;
DROP POLICY IF EXISTS "scenario_questions_delete_owned_or_scenario" ON public.scenario_questions;
CREATE POLICY "scenario_questions_select_owned_or_scenario" ON public.scenario_questions
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (owner_id IS NULL AND scenario_id IS NULL AND step_number IS NOT NULL)
    OR scenario_id IN (
      SELECT s.id
      FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

CREATE POLICY "scenario_questions_insert_owned_or_scenario" ON public.scenario_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR scenario_id IN (
      SELECT s.id
      FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

CREATE POLICY "scenario_questions_update_owned_or_scenario" ON public.scenario_questions
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR scenario_id IN (
      SELECT s.id
      FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR scenario_id IN (
      SELECT s.id
      FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

CREATE POLICY "scenario_questions_delete_owned_or_scenario" ON public.scenario_questions
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR scenario_id IN (
      SELECT s.id
      FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "question_choices_owner_all" ON public.question_choices;
DROP POLICY IF EXISTS "question_choices_select_owned_or_legacy_stage" ON public.question_choices;
DROP POLICY IF EXISTS "question_choices_write_owned_or_scenario" ON public.question_choices;
CREATE POLICY "question_choices_select_owned_or_legacy_stage" ON public.question_choices
  FOR SELECT TO authenticated
  USING (
    question_id IN (
      SELECT q.id
      FROM public.scenario_questions q
      WHERE (q.owner_id = auth.uid())
         OR (q.owner_id IS NULL AND q.scenario_id IS NULL AND q.step_number IS NOT NULL)
         OR q.scenario_id IN (
           SELECT s.id
           FROM public.scenarios s
           JOIN public.campaigns c ON c.id = s.campaign_id
           WHERE c.owner_id = auth.uid()
         )
    )
  );

CREATE POLICY "question_choices_write_owned_or_scenario" ON public.question_choices
  FOR ALL TO authenticated
  USING (
    question_id IN (
      SELECT q.id
      FROM public.scenario_questions q
      WHERE q.owner_id = auth.uid()
         OR q.scenario_id IN (
           SELECT s.id
           FROM public.scenarios s
           JOIN public.campaigns c ON c.id = s.campaign_id
           WHERE c.owner_id = auth.uid()
         )
    )
  )
  WITH CHECK (
    question_id IN (
      SELECT q.id
      FROM public.scenario_questions q
      WHERE q.owner_id = auth.uid()
         OR q.scenario_id IN (
           SELECT s.id
           FROM public.scenarios s
           JOIN public.campaigns c ON c.id = s.campaign_id
           WHERE c.owner_id = auth.uid()
         )
    )
  );

-- Refresh PostgREST's cached table definition so owner_id is available to the API.
NOTIFY pgrst, 'reload schema';
