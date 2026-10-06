-- Let a GM pause a team. Paused teams remain available in scenario tracking,
-- while their artwork and board category are hidden from player views.
-- Run after migration_fix_teams_policy_recursion.sql,
-- migration_team_art_board.sql, migration_team_art_all_users_read.sql, and
-- migration_npc_lore_and_master_art.sql.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_team_freeze_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NEW.is_frozen IS DISTINCT FROM OLD.is_frozen
     AND NOT public.current_user_is_gm() THEN
    RAISE EXCEPTION 'Only a GM may pause or resume a team';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.guard_team_freeze_changes() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_team_freeze_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS teams_guard_freeze_change ON public.teams;
CREATE TRIGGER teams_guard_freeze_change
  BEFORE UPDATE OF is_frozen ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_freeze_changes();

-- All authenticated users may browse active team artwork. GMs can still
-- review paused teams and their posts.
DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR team_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_art_posts.team_id AND NOT t.is_frozen
    )
  );

DROP POLICY IF EXISTS team_art_comments_read ON public.team_art_comments;
CREATE POLICY team_art_comments_read ON public.team_art_comments
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR EXISTS (
      SELECT 1 FROM public.team_art_posts p
      WHERE p.id = team_art_comments.post_id
        AND (p.team_id IS NULL OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = p.team_id AND NOT t.is_frozen
        ))
    )
  );

DROP POLICY IF EXISTS team_art_posts_insert ON public.team_art_posts;
CREATE POLICY team_art_posts_insert ON public.team_art_posts
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (
      (is_master_artwork AND public.current_user_is_gm() AND team_id IS NULL)
      OR (
        NOT is_master_artwork
        AND team_id IS NOT NULL
        AND (
          public.current_user_is_gm()
          OR (
            team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
            AND EXISTS (
              SELECT 1 FROM public.teams t
              WHERE t.id = team_art_posts.team_id AND NOT t.is_frozen
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS team_art_comments_insert ON public.team_art_comments;
CREATE POLICY team_art_comments_insert ON public.team_art_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_art_posts p
      WHERE p.id = team_art_comments.post_id
        AND (
          public.current_user_is_gm()
          OR (
            p.team_id IN (SELECT pc.team_id FROM public.player_character_context() pc)
            AND EXISTS (
              SELECT 1 FROM public.teams t
              WHERE t.id = p.team_id AND NOT t.is_frozen
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS team_art_images_read ON storage.objects;
CREATE POLICY team_art_images_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'free-board-images'
    AND (
      EXISTS (
        SELECT 1 FROM public.team_art_posts p
        WHERE name = ANY(p.image_paths)
          AND (public.current_user_is_gm() OR p.team_id IS NULL OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = p.team_id AND NOT t.is_frozen
          ))
      )
      OR EXISTS (
        SELECT 1
        FROM public.team_art_comments c
        JOIN public.team_art_posts p ON p.id = c.post_id
        WHERE c.image_path = name
          AND (public.current_user_is_gm() OR p.team_id IS NULL OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = p.team_id AND NOT t.is_frozen
          ))
      )
    )
  );

NOTIFY pgrst, 'reload schema';
