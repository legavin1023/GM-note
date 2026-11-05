SELECT
 (SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('notices','teams','app_activity_logs','player_team_members')) AS columns,
 pg_get_functiondef('public.current_user_is_gm()'::regprocedure) AS gm_check,
 pg_get_functiondef('public.player_team_context()'::regprocedure) AS player_team_check,
 (SELECT array_agg(extname) FROM pg_extension WHERE extname IN ('pg_cron','pg_net')) AS extensions;
