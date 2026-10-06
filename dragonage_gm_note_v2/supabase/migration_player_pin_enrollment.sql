-- First-time player PIN setup.
-- Apply after migration_player_access.sql and migration_shared_gm_permissions.sql.
-- The shared Dragonage code is accepted only while the target has no PIN.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.player_pin_login_limits (
  username text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz
);
ALTER TABLE public.player_pin_login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_pin_login_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_pin_login_limits TO service_role;

CREATE OR REPLACE FUNCTION public.player_pin_setup_status(p_username text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT COALESCE((
    SELECT u.pin IS NOT NULL
    FROM public.users u
    WHERE u.username = btrim(p_username) AND u.team_id IS NOT NULL
    LIMIT 1
  ), false)
$$;
ALTER FUNCTION public.player_pin_setup_status(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.player_pin_setup_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_pin_setup_status(text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_player_pin_setup(
  p_username text, p_setup_code text, p_raw_pin text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  target public.users%ROWTYPE;
BEGIN
  IF p_raw_pin IS NULL OR p_raw_pin !~ '^[0-9]{4}$'
     OR lower(btrim(COALESCE(p_setup_code, ''))) <> 'dragonage' THEN
    RETURN false;
  END IF;

  SELECT u.* INTO target
  FROM public.users u
  WHERE u.username = btrim(p_username) AND u.team_id IS NOT NULL
  ORDER BY u.created_at NULLS LAST
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR target.pin IS NOT NULL THEN RETURN false; END IF;

  UPDATE public.users
  SET pin = extensions.crypt(p_raw_pin, extensions.gen_salt('bf'))
  WHERE id = target.id AND pin IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END;
$$;
ALTER FUNCTION public.complete_player_pin_setup(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_player_pin_setup(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_player_pin_setup(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.player_pin_login_allowed(p_username text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  limit_row public.player_pin_login_limits%ROWTYPE;
BEGIN
  INSERT INTO public.player_pin_login_limits(username)
  VALUES (lower(btrim(p_username)))
  ON CONFLICT (username) DO NOTHING;
  SELECT * INTO limit_row FROM public.player_pin_login_limits
  WHERE username = lower(btrim(p_username)) FOR UPDATE;

  IF limit_row.blocked_until > now() THEN RETURN false; END IF;
  IF limit_row.window_started_at < now() - interval '15 minutes' THEN
    UPDATE public.player_pin_login_limits
    SET window_started_at = now(), failed_attempts = 0, blocked_until = NULL
    WHERE username = lower(btrim(p_username));
  END IF;
  RETURN true;
END;
$$;
ALTER FUNCTION public.player_pin_login_allowed(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.player_pin_login_allowed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_pin_login_allowed(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_player_pin_login_failure(p_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  normalized text := lower(btrim(p_username));
  next_failures integer;
BEGIN
  INSERT INTO public.player_pin_login_limits(username)
  VALUES (normalized)
  ON CONFLICT (username) DO NOTHING;
  UPDATE public.player_pin_login_limits
  SET window_started_at = CASE
        WHEN window_started_at < now() - interval '15 minutes' THEN now()
        ELSE window_started_at END,
      failed_attempts = CASE
        WHEN window_started_at < now() - interval '15 minutes' THEN 1
        ELSE failed_attempts + 1 END,
      blocked_until = CASE
        WHEN (CASE WHEN window_started_at < now() - interval '15 minutes'
          THEN 1 ELSE failed_attempts + 1 END) >= 5
          THEN now() + interval '15 minutes'
        ELSE blocked_until END
  WHERE username = normalized
  RETURNING failed_attempts INTO next_failures;
END;
$$;
ALTER FUNCTION public.record_player_pin_login_failure(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_player_pin_login_failure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_pin_login_failure(text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_player_pin_login_failures(p_username text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  DELETE FROM public.player_pin_login_limits WHERE username = lower(btrim(p_username))
$$;
ALTER FUNCTION public.clear_player_pin_login_failures(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.clear_player_pin_login_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_player_pin_login_failures(text) TO service_role;

-- Do not let an ordinary client overwrite an existing PIN through the legacy
-- RPC. Master-only resets remain available through this explicit privileged path.
CREATE OR REPLACE FUNCTION public.update_user_pin(target_user_id uuid, raw_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT public.current_user_is_gm() THEN
    RAISE EXCEPTION 'Only a master may change an existing PIN';
  END IF;
  IF raw_pin IS NULL OR raw_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must contain exactly four digits';
  END IF;
  UPDATE public.users
  SET pin = extensions.crypt(raw_pin, extensions.gen_salt('bf'))
  WHERE id = target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Character not found'; END IF;
END;
$$;
ALTER FUNCTION public.update_user_pin(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_user_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_pin(uuid, text) TO authenticated;

-- PIN verification is performed only inside the rate-limited Edge Function.
REVOKE ALL ON FUNCTION public.verify_user_pin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_pin(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
