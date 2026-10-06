-- Team-scoped artwork board, separate from both the team tracker and notices.
-- Run after migration_player_access.sql, migration_shared_gm_permissions.sql,
-- and migration_free_board.sql.
-- Source rows are copied (never removed) from the older posts/comments tables
-- and from free_board_posts/free_board_comments when those tables exist.

CREATE TABLE IF NOT EXISTS public.team_art_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nickname text NOT NULL DEFAULT '이전 작성자',
  avatar_url text,
  content text NOT NULL DEFAULT '',
  image_paths text[] NOT NULL DEFAULT '{}',
  is_spoiler boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_art_posts_content_or_image CHECK (
    length(btrim(content)) > 0 OR cardinality(image_paths) > 0
  ),
  CONSTRAINT team_art_posts_max_images CHECK (cardinality(image_paths) <= 10)
);
CREATE INDEX IF NOT EXISTS team_art_posts_team_created_idx
  ON public.team_art_posts(team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.team_art_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE,
  post_id uuid NOT NULL REFERENCES public.team_art_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nickname text NOT NULL DEFAULT '이전 작성자',
  avatar_url text,
  content text NOT NULL DEFAULT '',
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_art_comments_content_or_image CHECK (
    length(btrim(content)) > 0 OR NULLIF(image_path, '') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS team_art_comments_post_created_idx
  ON public.team_art_comments(post_id, created_at ASC);

ALTER TABLE public.team_art_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_art_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_art_posts, public.team_art_comments FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_art_posts TO authenticated;
GRANT UPDATE (team_id, is_spoiler) ON public.team_art_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_art_comments TO authenticated;

DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR team_id IN (SELECT team_id FROM public.player_character_context())
  );
DROP POLICY IF EXISTS team_art_posts_insert ON public.team_art_posts;
CREATE POLICY team_art_posts_insert ON public.team_art_posts
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND team_id IS NOT NULL
    AND (
      public.current_user_is_gm()
      OR team_id IN (SELECT team_id FROM public.player_character_context())
    )
  );
DROP POLICY IF EXISTS team_art_posts_moderate ON public.team_art_posts;
CREATE POLICY team_art_posts_moderate ON public.team_art_posts
  FOR UPDATE TO authenticated
  USING (public.current_user_is_gm())
  WITH CHECK (public.current_user_is_gm());
DROP POLICY IF EXISTS team_art_posts_admin_delete ON public.team_art_posts;
CREATE POLICY team_art_posts_admin_delete ON public.team_art_posts
  FOR DELETE TO authenticated USING (public.current_user_is_gm());

DROP POLICY IF EXISTS team_art_comments_read ON public.team_art_comments;
CREATE POLICY team_art_comments_read ON public.team_art_comments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.team_art_posts p
    WHERE p.id = post_id
      AND (public.current_user_is_gm()
        OR p.team_id IN (SELECT team_id FROM public.player_character_context()))
  ));
DROP POLICY IF EXISTS team_art_comments_insert ON public.team_art_comments;
CREATE POLICY team_art_comments_insert ON public.team_art_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_art_posts p
      WHERE p.id = post_id
        AND (public.current_user_is_gm()
          OR p.team_id IN (SELECT team_id FROM public.player_character_context()))
    )
  );
DROP POLICY IF EXISTS team_art_comments_admin_delete ON public.team_art_comments;
CREATE POLICY team_art_comments_admin_delete ON public.team_art_comments
  FOR DELETE TO authenticated USING (
    public.current_user_is_gm()
    AND EXISTS (SELECT 1 FROM public.team_art_posts p WHERE p.id = post_id)
  );

-- Current free-board object paths and legacy external image URLs are both kept
-- unchanged. Only images referenced by a visible team-art record are exposed.
DROP POLICY IF EXISTS team_art_images_read ON storage.objects;
CREATE POLICY team_art_images_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'free-board-images'
    AND (
      EXISTS (SELECT 1 FROM public.team_art_posts p WHERE name = ANY(p.image_paths))
      OR EXISTS (SELECT 1 FROM public.team_art_comments c WHERE c.image_path = name)
    )
  );

-- Copy old team posts into the new work board. source_key makes this safe to
-- rerun; originals and their comments are left untouched.
DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.team_art_posts
        (source_key, team_id, user_id, nickname, content, image_paths, created_at)
      SELECT 'posts:' || p.id::text,
        NULLIF(to_jsonb(p)->>'team_id', '')::uuid,
        COALESCE(
          (SELECT m.user_id FROM public.player_team_members m
           WHERE m.user_id::text = to_jsonb(p)->>'user_id' LIMIT 1),
          (SELECT m.user_id FROM public.player_team_members m
           JOIN public.users u ON u.username = m.login_username
           WHERE u.id::text = to_jsonb(p)->>'user_id' LIMIT 1),
          NULLIF(to_jsonb(p)->>'user_id', '')::uuid
        ),
        COALESCE(NULLIF(to_jsonb(p)->>'nickname', ''), '이전 작성자'),
        COALESCE(to_jsonb(p)->>'content', ''),
        CASE
          WHEN NULLIF(to_jsonb(p)->>'image_url', '') IS NULL THEN '{}'::text[]
          WHEN jsonb_typeof(to_jsonb(p)->'image_url') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(to_jsonb(p)->'image_url'))
          WHEN left(btrim(to_jsonb(p)->>'image_url'), 1) = '['
            THEN ARRAY(SELECT jsonb_array_elements_text((to_jsonb(p)->>'image_url')::jsonb))
          ELSE ARRAY[to_jsonb(p)->>'image_url']
        END,
        COALESCE(NULLIF(to_jsonb(p)->>'created_at', '')::timestamptz, now())
      FROM public.posts p
      WHERE NULLIF(to_jsonb(p)->>'team_id', '') IS NOT NULL
        AND NULLIF(to_jsonb(p)->>'user_id', '') IS NOT NULL
        AND (
          length(btrim(COALESCE(to_jsonb(p)->>'content', ''))) > 0
          OR NULLIF(to_jsonb(p)->>'image_url', '') IS NOT NULL
        )
        AND EXISTS (SELECT 1 FROM public.teams t
          WHERE t.id::text = to_jsonb(p)->>'team_id')
      ON CONFLICT (source_key) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.comments') IS NOT NULL
     AND to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.team_art_comments
        (source_key, post_id, user_id, nickname, content, created_at)
      SELECT 'comments:' || c.id::text, p.id,
        COALESCE(
          (SELECT m.user_id FROM public.player_team_members m
           WHERE m.user_id::text = to_jsonb(c)->>'user_id' LIMIT 1),
          (SELECT m.user_id FROM public.player_team_members m
           JOIN public.users u ON u.username = m.login_username
           WHERE u.id::text = to_jsonb(c)->>'user_id' LIMIT 1),
          NULLIF(to_jsonb(c)->>'user_id', '')::uuid
        ),
        COALESCE(NULLIF(to_jsonb(c)->>'nickname', ''), '이전 작성자'),
        COALESCE(to_jsonb(c)->>'content', ''),
        COALESCE(NULLIF(to_jsonb(c)->>'created_at', '')::timestamptz, now())
      FROM public.comments c
      JOIN public.posts old_post
        ON old_post.id::text = to_jsonb(c)->>'post_id'
      JOIN public.team_art_posts p
        ON p.source_key = 'posts:' || old_post.id::text
      WHERE NULLIF(to_jsonb(c)->>'user_id', '') IS NOT NULL
        AND length(btrim(COALESCE(to_jsonb(c)->>'content', ''))) > 0
      ON CONFLICT (source_key) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.free_board_posts') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.team_art_posts
        (source_key, team_id, user_id, nickname, avatar_url, content, image_paths, created_at)
      SELECT 'free_board_posts:' || p.id::text, mapped.team_id, p.user_id,
        COALESCE(NULLIF(p.nickname, ''), '이전 작성자'), p.avatar_url,
        COALESCE(p.content, ''), COALESCE(p.image_paths, '{}'::text[]), p.created_at
      FROM public.free_board_posts p
      LEFT JOIN LATERAL (
        SELECT min(u.team_id::text)::uuid AS team_id
        FROM public.player_team_members m
        JOIN public.users u ON u.username = m.login_username
        WHERE m.user_id = p.user_id AND u.team_id IS NOT NULL
        HAVING count(DISTINCT u.team_id) = 1
      ) mapped ON true
      ON CONFLICT (source_key) DO NOTHING
    $copy$;
  END IF;

  IF to_regclass('public.free_board_comments') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.team_art_comments
        (source_key, post_id, user_id, nickname, avatar_url, content, image_path, created_at)
      SELECT 'free_board_comments:' || c.id::text, p.id, c.user_id,
        COALESCE(NULLIF(c.nickname, ''), '이전 작성자'), c.avatar_url,
        COALESCE(c.content, ''), c.image_path, c.created_at
      FROM public.free_board_comments c
      JOIN public.team_art_posts p
        ON p.source_key = 'free_board_posts:' || c.post_id::text
      WHERE length(btrim(COALESCE(c.content, ''))) > 0
         OR NULLIF(c.image_path, '') IS NOT NULL
      ON CONFLICT (source_key) DO NOTHING
    $copy$;
  END IF;
END;
$$;

-- Match historical username-linked player posts to the author's sole team.
UPDATE public.team_art_posts p SET team_id = (
  SELECT min(u.team_id::text)::uuid
  FROM public.player_team_members m
  JOIN public.users u ON u.username = m.login_username
  WHERE m.user_id = p.user_id AND u.team_id IS NOT NULL
  HAVING count(DISTINCT u.team_id) = 1
)
WHERE p.team_id IS NULL AND p.source_key LIKE 'free_board_posts:%';

-- Derive the identity for every new post/comment from Supabase Auth. Imported
-- historical names above are left as they were stored in their source tables.
DROP TRIGGER IF EXISTS team_art_posts_set_author ON public.team_art_posts;
CREATE TRIGGER team_art_posts_set_author
  BEFORE INSERT ON public.team_art_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_free_board_author();
DROP TRIGGER IF EXISTS team_art_comments_set_author ON public.team_art_comments;
CREATE TRIGGER team_art_comments_set_author
  BEFORE INSERT ON public.team_art_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_free_board_author();

NOTIFY pgrst, 'reload schema';
