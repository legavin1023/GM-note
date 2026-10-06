-- Increase artwork post attachments from three images to ten.
-- Run after migration_team_art_board.sql.

ALTER TABLE public.team_art_posts
  DROP CONSTRAINT IF EXISTS team_art_posts_max_images;

ALTER TABLE public.team_art_posts
  ADD CONSTRAINT team_art_posts_max_images
  CHECK (cardinality(image_paths) <= 10);

NOTIFY pgrst, 'reload schema';
