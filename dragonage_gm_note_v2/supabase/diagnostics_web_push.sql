-- Read-only deployment checks. Never print trigger arguments or stored secrets.
SELECT 'columns' AS check_name, jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type)) AS details
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'team_art_posts'
UNION ALL
SELECT 'policies', jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'permissive', permissive))
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'team_art_posts'
UNION ALL
SELECT 'triggers', jsonb_agg(jsonb_build_object('name', t.tgname, 'function', p.proname, 'function_schema', n.nspname))
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE t.tgrelid = 'public.team_art_posts'::regclass AND NOT t.tgisinternal
UNION ALL
SELECT 'push_tables', jsonb_build_object('subscriptions', to_regclass('public.push_subscriptions'), 'deliveries', to_regclass('public.push_deliveries'))
UNION ALL
SELECT 'webhook_support', jsonb_build_object('http_request', to_regprocedure('supabase_functions.http_request()'), 'pg_net', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'));
