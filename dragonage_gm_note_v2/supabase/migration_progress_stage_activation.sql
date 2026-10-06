-- Let the master hide unused tracker stages without deleting their history.
-- Run after migration_player_tracker_visibility.sql.

ALTER TABLE public.progress_stages
  ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.progress_stages
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.progress_stages
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- Player-visible completed stages must be active. This helper is used by the
-- existing tracker RLS policies, so hidden stage questions and answers stay
-- hidden through direct API requests as well.
CREATE OR REPLACE FUNCTION public.player_team_completed_stage(
  p_step_number integer
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT p_step_number IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.player_team_context() pc
    JOIN public.team_scenarios own_record
      ON own_record.team_id = pc.team_id
    JOIN public.progress_stages stage
      ON stage.step_number = own_record.step_number
    WHERE own_record.step_number = p_step_number
      AND own_record.completed
      AND stage.is_active
  )
$$;
ALTER FUNCTION public.player_team_completed_stage(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.player_team_completed_stage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_completed_stage(integer)
  TO authenticated;

DROP POLICY IF EXISTS "progress_stages_auth_read" ON public.progress_stages;
DROP POLICY IF EXISTS "progress_stages_player_and_gm_read"
  ON public.progress_stages;
CREATE POLICY "progress_stages_player_and_gm_read"
ON public.progress_stages FOR SELECT TO authenticated
USING (
  NOT EXISTS (SELECT 1 FROM public.player_team_context())
  OR (
    is_active
    AND step_number >= 1
    AND step_number <= public.player_visible_tracker_limit()
    AND public.player_team_completed_stage(step_number)
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.progress_stages FROM authenticated;
GRANT SELECT, UPDATE (is_active) ON public.progress_stages TO authenticated;
DROP POLICY IF EXISTS progress_stages_master_toggle ON public.progress_stages;
CREATE POLICY progress_stages_master_toggle ON public.progress_stages
  FOR UPDATE TO authenticated
  USING (public.current_user_is_gm())
  WITH CHECK (public.current_user_is_gm());

NOTIFY pgrst, 'reload schema';
