-- Allow every signed-in user to browse published team artwork from all teams.
-- Posting and moderation remain protected by the existing INSERT/UPDATE/DELETE
-- policies. Run after migration_team_art_board.sql and any earlier
-- team-art read policy migrations.

DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS team_art_comments_read ON public.team_art_comments;
CREATE POLICY team_art_comments_read ON public.team_art_comments
  FOR SELECT TO authenticated USING (true);

-- Team artwork image paths are already scoped to rows in team_art_posts and
-- team_art_comments by team_art_images_read. Those records are now visible to
-- all authenticated users, so their private image files are readable too.

NOTIFY pgrst, 'reload schema';
