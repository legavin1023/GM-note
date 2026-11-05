-- Apply after migration_player_pin_enrollment.sql and migration_shared_gm_permissions.sql.
-- Deploy player-login AFTER this migration. Existing PINs remain valid.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_user_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  -- SQL maintenance/service-role work has no end-user identity.
  IF auth.uid() IS NULL OR public.current_user_is_gm() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF lower(btrim(COALESCE(NEW.role, ''))) = 'admin' THEN
      RAISE EXCEPTION 'Only a GM may assign administrator privileges';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Only a GM may change identity or role';
    END IF;
  ELSE
    IF lower(btrim(COALESCE(OLD.role, ''))) = 'admin' THEN
      RAISE EXCEPTION 'Only a GM may delete an administrator';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
ALTER FUNCTION public.guard_user_privileges() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_user_privileges() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS users_guard_privileges ON public.users;
CREATE TRIGGER users_guard_privileges BEFORE INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_user_privileges();

-- Hold the per-username lock through verification and failure accounting.
-- Concurrent attempts cannot pass a separate check before failures are recorded.
CREATE OR REPLACE FUNCTION public.verify_player_pin_limited(p_username text, p_raw_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE
  normalized text := lower(btrim(p_username));
  limits public.player_pin_login_limits%ROWTYPE;
  target public.users%ROWTYPE;
BEGIN
  IF p_username IS NULL OR length(btrim(p_username)) NOT BETWEEN 1 AND 120
     OR p_raw_pin IS NULL OR p_raw_pin !~ '^[0-9]{4}$' THEN RETURN 'invalid'; END IF;
  INSERT INTO public.player_pin_login_limits(username) VALUES(normalized)
  ON CONFLICT(username) DO NOTHING;
  SELECT * INTO limits FROM public.player_pin_login_limits
  WHERE username = normalized FOR UPDATE;
  IF limits.blocked_until > now() THEN RETURN 'blocked'; END IF;
  IF limits.window_started_at < now() - interval '15 minutes' THEN
    UPDATE public.player_pin_login_limits
    SET window_started_at = now(), failed_attempts = 0, blocked_until = NULL
    WHERE username = normalized;
  END IF;
  -- Require exactly one active character, matching the session creation path.
  IF (SELECT count(*) FROM public.users WHERE username = btrim(p_username)
      AND team_id IS NOT NULL) = 1 THEN
    SELECT * INTO target FROM public.users WHERE username = btrim(p_username)
    AND team_id IS NOT NULL;
    IF target.is_active AND public.verify_user_pin(target.id, p_raw_pin) IS TRUE THEN
      UPDATE public.player_pin_login_limits
      SET window_started_at = now(), failed_attempts = 0, blocked_until = NULL
      WHERE username = normalized;
      RETURN 'valid';
    END IF;
  END IF;
  PERFORM public.record_player_pin_login_failure(p_username);
  RETURN 'invalid';
END; $$;
ALTER FUNCTION public.verify_player_pin_limited(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_player_pin_limited(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_player_pin_limited(text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
