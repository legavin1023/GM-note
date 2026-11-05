SELECT public.push_board_is_shared() AS board_shared, public.push_comments_are_shared() AS comments_shared,
(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'qual',qual)) FROM pg_policies WHERE schemaname='public' AND tablename IN ('team_art_posts','team_art_comments') AND cmd='SELECT') AS policies,
(SELECT jsonb_agg(x) FROM (SELECT post_id,sent_at,created_at FROM public.discord_post_deliveries ORDER BY created_at DESC LIMIT 4)x) AS discord,
(SELECT count(*) FROM public.push_subscriptions) AS subscriptions,
(SELECT count(*) FROM public.team_art_posts) AS posts,
(SELECT array_agg(tgname) FROM pg_trigger WHERE tgrelid='public.team_art_posts'::regclass AND NOT tgisinternal) AS triggers,
(SELECT jsonb_agg(x) FROM (SELECT status_code, left(content,350) AS response FROM net._http_response ORDER BY id DESC LIMIT 8)x) AS responses;
