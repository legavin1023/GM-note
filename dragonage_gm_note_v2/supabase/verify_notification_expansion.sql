SELECT
 (SELECT jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity)) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('team_sessions','campaign_push_events','campaign_push_deliveries')) AS security,
 (SELECT jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) FROM cron.job WHERE jobname='campaign-session-push') AS cron,
 (SELECT array_agg(tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('notices_web_push','activity_web_push','team_art_new_post_push','team_art_own_comment_push')) AS triggers,
 (SELECT count(*) FROM public.campaign_push_events WHERE completed_at IS NULL AND expires_at>now()) AS pending,
 has_function_privilege('authenticated','public.campaign_push_recipients(text,uuid,uuid)','EXECUTE') AS client_can_read_recipients,
 has_function_privilege('authenticated','public.tick_campaign_push()','EXECUTE') AS client_can_run_scheduler;
