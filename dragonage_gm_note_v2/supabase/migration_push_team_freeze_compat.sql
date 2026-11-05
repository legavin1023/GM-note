BEGIN;
CREATE OR REPLACE FUNCTION public.push_board_is_shared()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
 WHERE schemaname='public' AND tablename='team_art_posts' AND cmd IN ('SELECT','ALL')
 AND permissive='PERMISSIVE' AND 'authenticated'=ANY(roles)
 AND (qual='true' OR (policyname='team_art_posts_read' AND
 regexp_replace(replace(qual, 'public.', ''),'\s+',' ','g')='(current_user_is_gm() OR (team_id IS NULL) OR (EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_art_posts.team_id) AND (NOT t.is_frozen)))))')))
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
 WHERE schemaname='public' AND tablename='team_art_posts' AND cmd IN ('SELECT','ALL')
 AND permissive='RESTRICTIVE' AND policyname<>'inactive_player_guard'
 AND roles && ARRAY['authenticated','public']::name[]);
$$;
REVOKE ALL ON FUNCTION public.push_board_is_shared() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.push_board_is_shared() TO service_role;
CREATE OR REPLACE FUNCTION public.push_comments_are_shared()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
 WHERE schemaname='public' AND tablename='team_art_comments' AND cmd IN ('SELECT','ALL')
 AND permissive='PERMISSIVE' AND 'authenticated'=ANY(roles)
 AND (qual='true' OR (policyname='team_art_comments_read' AND
 regexp_replace(replace(qual, 'public.', ''),'\s+',' ','g')='(current_user_is_gm() OR (EXISTS ( SELECT 1 FROM team_art_posts p WHERE ((p.id = team_art_comments.post_id) AND ((p.team_id IS NULL) OR (EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = p.team_id) AND (NOT t.is_frozen)))))))))')))
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
 WHERE schemaname='public' AND tablename='team_art_comments' AND cmd IN ('SELECT','ALL')
 AND permissive='RESTRICTIVE' AND policyname<>'inactive_player_guard'
 AND roles && ARRAY['authenticated','public']::name[]);
$$;
REVOKE ALL ON FUNCTION public.push_comments_are_shared() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.push_comments_are_shared() TO service_role;
COMMIT;

-- Verify that an additional access restriction still stops broadcasts.
BEGIN;
DO $$ BEGIN
 IF NOT public.push_board_is_shared() OR NOT public.push_comments_are_shared() THEN
  RAISE EXCEPTION 'Expected freeze-aware policies were not recognized';
 END IF;
END $$;
CREATE POLICY push_verify_restriction ON public.team_art_posts AS RESTRICTIVE
FOR SELECT TO authenticated USING (false);
DO $$ BEGIN
 IF public.push_board_is_shared() THEN RAISE EXCEPTION 'Restricted board must block push'; END IF;
END $$;
ROLLBACK;
