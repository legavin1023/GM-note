-- Separate public discussion board. Apply after migration_shared_gm_permissions.sql
-- so the existing server-side GM role helper is available.

CREATE TABLE IF NOT EXISTS public.free_board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  avatar_url text,
  content text NOT NULL DEFAULT '',
  image_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_board_posts_content_or_image CHECK (
    length(btrim(content)) > 0 OR cardinality(image_paths) > 0
  ),
  CONSTRAINT free_board_posts_max_images CHECK (cardinality(image_paths) <= 3)
);
CREATE INDEX IF NOT EXISTS free_board_posts_created_at_idx
  ON public.free_board_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.free_board_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.free_board_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  avatar_url text,
  content text NOT NULL DEFAULT '',
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_board_comments_content_or_image CHECK (
    length(btrim(content)) > 0 OR NULLIF(image_path, '') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS free_board_comments_post_created_at_idx
  ON public.free_board_comments(post_id, created_at ASC);

-- Derive the displayed author from the server-side Auth record rather than
-- trusting a nickname or avatar supplied by the browser.
CREATE OR REPLACE FUNCTION public.set_free_board_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  metadata jsonb;
BEGIN
  SELECT * INTO auth_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid board author';
  END IF;
  metadata := COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb);
  NEW.nickname := COALESCE(
    NULLIF(metadata->>'nickname', ''),
    NULLIF(metadata->>'name', ''),
    NULLIF(metadata->>'full_name', ''),
    split_part(COALESCE(auth_user.email, 'user'), '@', 1)
  );
  NEW.avatar_url := COALESCE(NULLIF(metadata->>'avatar_url', ''), NULLIF(metadata->>'picture', ''));
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.set_free_board_author() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_free_board_author() FROM PUBLIC;
DROP TRIGGER IF EXISTS free_board_posts_set_author ON public.free_board_posts;
CREATE TRIGGER free_board_posts_set_author
BEFORE INSERT ON public.free_board_posts
FOR EACH ROW EXECUTE FUNCTION public.set_free_board_author();
DROP TRIGGER IF EXISTS free_board_comments_set_author ON public.free_board_comments;
CREATE TRIGGER free_board_comments_set_author
BEFORE INSERT ON public.free_board_comments
FOR EACH ROW EXECUTE FUNCTION public.set_free_board_author();

ALTER TABLE public.free_board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_board_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_board_posts, public.free_board_comments FROM anon;
GRANT SELECT, INSERT, DELETE ON public.free_board_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.free_board_comments TO authenticated;

DROP POLICY IF EXISTS free_board_posts_read ON public.free_board_posts;
CREATE POLICY free_board_posts_read ON public.free_board_posts
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS free_board_posts_insert ON public.free_board_posts;
CREATE POLICY free_board_posts_insert ON public.free_board_posts
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND cardinality(image_paths) <= 3
  AND NOT EXISTS (
    SELECT 1 FROM unnest(image_paths) AS uploaded(path)
    WHERE uploaded.path NOT LIKE auth.uid()::text || '/posts/' || id::text || '/%'
  )
);
DROP POLICY IF EXISTS free_board_posts_admin_delete ON public.free_board_posts;
CREATE POLICY free_board_posts_admin_delete ON public.free_board_posts
FOR DELETE TO authenticated USING (public.current_user_is_gm());

DROP POLICY IF EXISTS free_board_comments_read ON public.free_board_comments;
CREATE POLICY free_board_comments_read ON public.free_board_comments
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS free_board_comments_insert ON public.free_board_comments;
CREATE POLICY free_board_comments_insert ON public.free_board_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    image_path IS NULL
    OR image_path LIKE auth.uid()::text || '/comments/' || id::text || '/%'
  )
  AND EXISTS (SELECT 1 FROM public.free_board_posts p WHERE p.id = post_id)
);
DROP POLICY IF EXISTS free_board_comments_admin_delete ON public.free_board_comments;
CREATE POLICY free_board_comments_admin_delete ON public.free_board_comments
FOR DELETE TO authenticated USING (public.current_user_is_gm());

-- Private bucket: image URLs are signed by the client after authenticated reads.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('free-board-images', 'free-board-images', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS free_board_images_read ON storage.objects;
CREATE POLICY free_board_images_read ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'free-board-images'
  AND (
    EXISTS (
      SELECT 1 FROM public.free_board_posts p
      WHERE name = ANY(p.image_paths)
    )
    OR EXISTS (
      SELECT 1 FROM public.free_board_comments c
      WHERE c.image_path = name
    )
    OR ((storage.foldername(name))[1] = auth.uid()::text
        AND (storage.foldername(name))[3] = 'draft')
  )
);
DROP POLICY IF EXISTS free_board_images_insert ON storage.objects;
CREATE POLICY free_board_images_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'free-board-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[2] IN ('posts', 'comments')
);
DROP POLICY IF EXISTS free_board_images_admin_delete ON storage.objects;
CREATE POLICY free_board_images_admin_delete ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'free-board-images' AND public.current_user_is_gm()
);
DROP POLICY IF EXISTS free_board_images_owner_cleanup ON storage.objects;
CREATE POLICY free_board_images_owner_cleanup ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'free-board-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND NOT EXISTS (
    SELECT 1 FROM public.free_board_posts p WHERE name = ANY(p.image_paths)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.free_board_comments c WHERE c.image_path = name
  )
);

NOTIFY pgrst, 'reload schema';
