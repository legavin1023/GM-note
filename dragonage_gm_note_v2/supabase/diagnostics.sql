-- Run in Supabase SQL Editor to inspect Data API visibility, grants and RLS.
-- This script is read-only; it does not modify policies or grants.

SELECT
  p.schemaname,
  p.tablename,
  p.rowsecurity,
  has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename), 'SELECT') AS authenticated_can_select,
  has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename), 'INSERT') AS authenticated_can_insert,
  has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename), 'UPDATE') AS authenticated_can_update,
  has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename), 'DELETE') AS authenticated_can_delete
FROM pg_tables AS p
WHERE p.schemaname = 'public'
  AND p.tablename = ANY (ARRAY[
    'campaigns', 'teams', 'users', 'progress_stages', 'scenarios',
    'scenario_questions', 'question_choices', 'team_scenarios',
    'team_scenario_answers', 'images'
  ])
ORDER BY p.tablename;

SELECT
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'campaigns', 'teams', 'users', 'progress_stages', 'scenarios',
    'scenario_questions', 'question_choices', 'team_scenarios',
    'team_scenario_answers', 'images'
  ])
ORDER BY tablename, policyname;

-- Confirm actual columns used by the client match the live schema.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = ANY (ARRAY[
    'campaigns', 'teams', 'users', 'progress_stages', 'scenarios',
    'scenario_questions', 'question_choices', 'team_scenarios',
    'team_scenario_answers', 'images'
  ])
ORDER BY table_name, ordinal_position;

-- Compare stored rows and campaign associations (SQL Editor runs with elevated
-- database privileges, so compare these counts with browser RLS-visible counts).
SELECT
  c.id AS campaign_id,
  c.owner_id,
  (SELECT count(*) FROM public.teams t WHERE t.campaign_id = c.id) AS teams_count,
  (SELECT count(*) FROM public.users u JOIN public.teams t ON t.id = u.team_id WHERE t.campaign_id = c.id) AS characters_count,
  (SELECT count(*) FROM public.scenarios s WHERE s.campaign_id = c.id) AS scenarios_count
FROM public.campaigns c
ORDER BY c.created_at DESC;
