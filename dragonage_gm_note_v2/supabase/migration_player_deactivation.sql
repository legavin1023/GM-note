BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.current_session_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
 SELECT auth.uid() IS NOT NULL AND (public.current_user_is_gm() OR NOT EXISTS (
  SELECT 1 FROM public.player_team_members m JOIN public.users u ON u.username=m.login_username
  WHERE m.user_id=auth.uid() AND NOT u.is_active
 ));
$$;
REVOKE ALL ON FUNCTION public.current_session_is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_session_is_active() TO authenticated;
CREATE OR REPLACE FUNCTION public.set_player_active(p_character_id uuid,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE target public.users%ROWTYPE;
BEGIN
 IF NOT public.current_user_is_gm() THEN RAISE EXCEPTION 'Only a GM may change player status'; END IF;
 SELECT * INTO target FROM public.users WHERE id=p_character_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
 IF lower(btrim(coalesce(target.role,'')))='admin' THEN RAISE EXCEPTION 'GM accounts cannot be deactivated here'; END IF;
 IF p_active IS NULL THEN RAISE EXCEPTION 'Player status is required'; END IF;
 UPDATE public.users SET is_active=p_active WHERE id=p_character_id;
 IF NOT p_active THEN DELETE FROM public.push_subscriptions WHERE user_id IN (SELECT user_id FROM public.player_team_members WHERE login_username=target.username); END IF;
 RETURN jsonb_build_object('id',p_character_id,'is_active',p_active);
END; $$;
REVOKE ALL ON FUNCTION public.set_player_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_player_active(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_player_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
 IF NEW.is_active IS DISTINCT FROM OLD.is_active AND auth.uid() IS NOT NULL AND NOT public.current_user_is_gm() THEN RAISE EXCEPTION 'Only a GM may change player status'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_player_active() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS users_guard_active ON public.users;
CREATE TRIGGER users_guard_active BEFORE UPDATE OF is_active ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_player_active();
-- Existing JWTs must lose access too; do not merely hide a login button.
DO $$ DECLARE item record; definition text; fn text;
BEGIN
 FOR item IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND c.relrowsecurity AND (n.nspname='public' OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))) LOOP
  EXECUTE format('DROP POLICY IF EXISTS inactive_player_guard ON %I.%I',item.nspname,item.relname);
  EXECUTE format('CREATE POLICY inactive_player_guard ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.current_session_is_active()) WITH CHECK(public.current_session_is_active())',item.nspname,item.relname);
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['public.player_team_context()','public.player_character_context()'] LOOP
  definition:=pg_get_functiondef(fn::regprocedure);
  IF position('AND public.current_session_is_active()' IN definition)=0 THEN
   IF position('WHERE m.user_id = auth.uid()' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected player context definition'; END IF;
   definition:=replace(definition,'WHERE m.user_id = auth.uid()','WHERE m.user_id = auth.uid() AND public.current_session_is_active()');
   EXECUTE definition;
  END IF;
 END LOOP;
END; $$;
-- Inactive subscriptions are removed atomically above. This guard must not
-- disable broadcasts to the remaining active users.
DO $$ DECLARE fn text; definition text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.push_board_is_shared()','public.push_comments_are_shared()'] LOOP
  definition:=pg_get_functiondef(fn::regprocedure);
  IF position('inactive_player_guard' IN definition)=0 THEN
   definition:=replace(definition,$from$AND permissive = 'RESTRICTIVE'$from$,$to$AND permissive = 'RESTRICTIVE' AND policyname <> 'inactive_player_guard'$to$);
   EXECUTE definition;
  END IF;
 END LOOP;
END; $$;
COMMIT;
NOTIFY pgrst,'reload schema';
