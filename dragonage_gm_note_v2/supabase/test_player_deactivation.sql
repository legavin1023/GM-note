BEGIN;
DO $$
DECLARE gm uuid; character_id uuid; player_auth uuid; before_count bigint;
BEGIN
 SELECT id INTO gm FROM public.users WHERE lower(btrim(role))='admin' LIMIT 1;
 SELECT u.id,m.user_id INTO character_id,player_auth FROM public.player_team_members m JOIN public.users u ON u.username=m.login_username
 WHERE u.team_id IS NOT NULL AND u.is_active AND lower(btrim(coalesce(u.role,'')))<>'admin'
 AND NOT EXISTS(SELECT 1 FROM public.users other_user WHERE other_user.username=m.login_username AND other_user.team_id IS DISTINCT FROM u.team_id) LIMIT 1;
 IF gm IS NULL OR character_id IS NULL THEN RAISE EXCEPTION 'Missing test profiles'; END IF;
 SELECT count(*) INTO before_count FROM public.users;
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM public.set_player_active(character_id,false);
 IF (SELECT count(*) FROM public.users)<>before_count OR (SELECT is_active FROM public.users WHERE id=character_id) THEN RAISE EXCEPTION 'Profile preservation failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',player_auth::text,true);
 IF public.current_session_is_active() OR EXISTS(SELECT 1 FROM public.player_team_context()) THEN RAISE EXCEPTION 'Inactive session context accessible'; END IF;
 BEGIN
  PERFORM public.set_player_active(character_id,true);
  RAISE EXCEPTION 'Unexpected player activation';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only a GM may change player status' THEN RAISE; END IF; END;
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.team_art_posts) OR EXISTS(SELECT 1 FROM public.users) THEN RAISE EXCEPTION 'Inactive player RLS leak'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM public.set_player_active(character_id,true);
 PERFORM set_config('request.jwt.claim.sub',player_auth::text,true);
 IF NOT public.current_session_is_active() OR NOT EXISTS(SELECT 1 FROM public.player_team_context()) THEN RAISE EXCEPTION 'Reactivation failed'; END IF;
 IF NOT public.push_board_is_shared() OR NOT public.push_comments_are_shared() THEN RAISE EXCEPTION 'Existing Push disabled'; END IF;
END; $$;
ROLLBACK;
SELECT 'Deactivation/reactivation, profile preservation, existing session RLS, GM-only changes and existing Push: passed (rolled back)' AS result;
