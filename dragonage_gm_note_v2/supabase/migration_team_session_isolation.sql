-- Session dates may be edited, but an existing event can never move teams.
BEGIN;
CREATE OR REPLACE FUNCTION public.keep_session_team()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
  RAISE EXCEPTION 'A session cannot be moved to another team; create a separate session';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.keep_session_team() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS team_sessions_keep_team ON public.team_sessions;
CREATE TRIGGER team_sessions_keep_team BEFORE UPDATE OF team_id ON public.team_sessions FOR EACH ROW EXECUTE FUNCTION public.keep_session_team();
REVOKE UPDATE ON public.team_sessions FROM authenticated;
GRANT UPDATE(title,starts_at,cancelled) ON public.team_sessions TO authenticated;
COMMIT;
