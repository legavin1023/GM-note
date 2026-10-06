-- Let authenticated players browse every artwork post/comment in their own
-- campaign. Post creation and spoiler moderation remain restricted by their
-- existing INSERT/UPDATE/DELETE policies.
-- Run after migration_team_art_board.sql and migration_team_art_character_tags.sql.

DROP POLICY IF EXISTS team_art_posts_read ON public.team_art_posts;
CREATE POLICY team_art_posts_read ON public.team_art_posts
  FOR SELECT TO authenticated USING (
    public.current_user_is_gm()
    OR team_id IN (
      SELECT visible_team.id
      FROM public.teams visible_team
      JOIN public.player_character_context() viewer ON TRUE
      WHERE visible_team.campaign_id = viewer.campaign_id
    )
  );

DROP POLICY IF EXISTS team_art_comments_read ON public.team_art_comments;
CREATE POLICY team_art_comments_read ON public.team_art_comments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.team_art_posts p
    WHERE p.id = post_id
      AND (
        public.current_user_is_gm()
        OR p.team_id IN (
          SELECT visible_team.id
          FROM public.teams visible_team
          JOIN public.player_character_context() viewer ON TRUE
          WHERE visible_team.campaign_id = viewer.campaign_id
        )
      )
  ));

NOTIFY pgrst, 'reload schema';
