BEGIN;
SET LOCAL ROLE authenticated;
SELECT id, is_frozen FROM public.teams LIMIT 1;
ROLLBACK;

SELECT
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'is_frozen') AS column_type,
  (SELECT count(*) FROM public.teams) AS teams,
  (SELECT count(*) FROM public.teams WHERE is_frozen IS NULL) AS missing_freeze_state,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.teams'::regclass
          AND tgname = 'teams_guard_freeze_change') AS guard_installed;
