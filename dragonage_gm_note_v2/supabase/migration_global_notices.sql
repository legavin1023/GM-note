-- Separate, campaign-independent announcements.
-- Apply after migration_shared_gm_permissions.sql, which provides the
-- SECURITY DEFINER public.current_user_is_gm() role check.

CREATE TABLE IF NOT EXISTS public.global_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  author_name text NOT NULL,
  author_avatar_url text,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.global_notices
  ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS global_notices_source_key_key
  ON public.global_notices(source_key);

CREATE INDEX IF NOT EXISTS global_notices_created_at_idx
  ON public.global_notices(created_at DESC);

ALTER TABLE public.global_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_notices FROM anon, authenticated;
GRANT SELECT, DELETE ON public.global_notices TO authenticated;
GRANT INSERT (user_id, title, content) ON public.global_notices TO authenticated;
GRANT UPDATE (title, content) ON public.global_notices TO authenticated;

DROP POLICY IF EXISTS global_notices_authenticated_read ON public.global_notices;
CREATE POLICY global_notices_authenticated_read ON public.global_notices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS global_notices_gm_insert ON public.global_notices;
CREATE POLICY global_notices_gm_insert ON public.global_notices
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_gm() AND user_id = auth.uid());

DROP POLICY IF EXISTS global_notices_gm_update ON public.global_notices;
CREATE POLICY global_notices_gm_update ON public.global_notices
  FOR UPDATE TO authenticated
  USING (public.current_user_is_gm())
  WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS global_notices_gm_delete ON public.global_notices;
CREATE POLICY global_notices_gm_delete ON public.global_notices
  FOR DELETE TO authenticated
  USING (public.current_user_is_gm());

-- Keep author identity and creation time server-controlled. Updates only touch
-- the body/title columns granted above, preserving author and created_at.
CREATE OR REPLACE FUNCTION public.set_global_notice_metadata()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  auth_row auth.users%ROWTYPE;
  metadata jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.current_user_is_gm() OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only an authenticated manager may publish a notice';
    END IF;
    SELECT au.* INTO auth_row
    FROM auth.users au
    WHERE au.id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated user not found'; END IF;

    metadata := COALESCE(auth_row.raw_user_meta_data, '{}'::jsonb);
    NEW.author_name := COALESCE(
      NULLIF(metadata->>'nickname', ''),
      NULLIF(metadata->>'name', ''),
      NULLIF(metadata->>'full_name', ''),
      NULLIF(split_part(COALESCE(auth_row.email, ''), '@', 1), ''),
      '관리자'
    );
    NEW.author_avatar_url := COALESCE(
      NULLIF(metadata->>'avatar_url', ''),
      NULLIF(metadata->>'picture', '')
    );
    NEW.created_at := now();
  ELSE
    IF NOT public.current_user_is_gm() THEN
      RAISE EXCEPTION 'Only an authenticated manager may edit a notice';
    END IF;
    NEW.user_id := OLD.user_id;
    NEW.author_name := OLD.author_name;
    NEW.author_avatar_url := OLD.author_avatar_url;
    NEW.created_at := OLD.created_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.set_global_notice_metadata() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_global_notice_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS global_notices_set_metadata ON public.global_notices;
CREATE TRIGGER global_notices_set_metadata
  BEFORE INSERT OR UPDATE ON public.global_notices
  FOR EACH ROW EXECUTE FUNCTION public.set_global_notice_metadata();

-- Import pre-existing public.notices rows into the shared notice table. This
-- preserves their original IDs as source keys and keeps the migration rerunnable.
DO $$
BEGIN
  IF to_regclass('public.notices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.global_notices DISABLE TRIGGER global_notices_set_metadata';
    EXECUTE $copy$
      INSERT INTO public.global_notices
        (source_key, user_id, author_name, author_avatar_url, title, content,
         created_at, updated_at)
      SELECT
        'notices:' || (to_jsonb(n)->>'id'),
        au.id,
        COALESCE(
          NULLIF(to_jsonb(n)->>'author_name', ''),
          NULLIF(to_jsonb(n)->>'nickname', ''),
          NULLIF(to_jsonb(u)->>'username', ''),
          NULLIF(au.raw_user_meta_data->>'nickname', ''),
          NULLIF(au.raw_user_meta_data->>'full_name', ''),
          NULLIF(split_part(COALESCE(au.email, ''), '@', 1), ''),
          '관리자'
        ),
        COALESCE(
          NULLIF(to_jsonb(n)->>'author_avatar_url', ''),
          NULLIF(to_jsonb(n)->>'avatar_url', ''),
          NULLIF(au.raw_user_meta_data->>'avatar_url', ''),
          NULLIF(au.raw_user_meta_data->>'picture', '')
        ),
        NULLIF(to_jsonb(n)->>'title', ''),
        NULLIF(to_jsonb(n)->>'content', ''),
        COALESCE(NULLIF(to_jsonb(n)->>'created_at', '')::timestamptz, now()),
        COALESCE(NULLIF(to_jsonb(n)->>'updated_at', '')::timestamptz,
                 NULLIF(to_jsonb(n)->>'created_at', '')::timestamptz, now())
      FROM public.notices n
      JOIN auth.users au ON au.id::text = to_jsonb(n)->>'user_id'
      LEFT JOIN public.users u ON to_jsonb(u)->>'id' = to_jsonb(n)->>'user_id'
      WHERE NULLIF(to_jsonb(n)->>'id', '') IS NOT NULL
        AND NULLIF(to_jsonb(n)->>'title', '') IS NOT NULL
        AND NULLIF(to_jsonb(n)->>'content', '') IS NOT NULL
      ON CONFLICT (source_key) DO NOTHING
    $copy$;
    EXECUTE 'ALTER TABLE public.global_notices ENABLE TRIGGER global_notices_set_metadata';
  END IF;
END;
$$;

-- Supabase Realtime only publishes changes for tables in this publication.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'global_notices'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_notices;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
