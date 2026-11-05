SELECT (SELECT jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'using',qual,'check',with_check)) FROM pg_policies WHERE schemaname='public' AND tablename='teams') AS policies,
 (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'function',p.proname)) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.teams'::regclass AND NOT t.tgisinternal) AS triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type)) FROM information_schema.columns WHERE table_schema='public' AND table_name='teams') AS columns;
