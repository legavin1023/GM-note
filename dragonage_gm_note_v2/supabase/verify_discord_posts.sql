SELECT (SELECT array_agg(tgname) FROM pg_trigger WHERE tgrelid='public.team_art_posts'::regclass AND NOT tgisinternal) AS triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',jobname,'active',active)) FROM cron.job WHERE jobname='discord-post-retry') AS cron,
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.discord_post_deliveries'::regclass) AS rls;
