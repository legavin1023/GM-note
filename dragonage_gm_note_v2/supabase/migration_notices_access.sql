-- Use the existing public.notices table for the shared announcement page.
-- Run after migration_shared_gm_permissions.sql. This preserves existing rows
-- and database triggers (including any Discord notification trigger).

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;

DROP POLICY IF EXISTS notices_authenticated_read ON public.notices;
CREATE POLICY notices_authenticated_read ON public.notices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS notices_gm_insert ON public.notices;
CREATE POLICY notices_gm_insert ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_gm()
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS notices_gm_update ON public.notices;
CREATE POLICY notices_gm_update ON public.notices
  FOR UPDATE TO authenticated
  USING (public.current_user_is_gm())
  WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS notices_gm_delete ON public.notices;
CREATE POLICY notices_gm_delete ON public.notices
  FOR DELETE TO authenticated
  USING (public.current_user_is_gm());

-- Keep inserts simple for the existing schema and preserve user_id identity.
GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notices'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
