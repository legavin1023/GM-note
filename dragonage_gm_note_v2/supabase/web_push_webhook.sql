-- Apply after migration_web_push.sql and after saving web_push_webhook_secret in Vault.
-- No private values are stored in function source or trigger arguments.
CREATE OR REPLACE FUNCTION public.notify_new_post_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO webhook_secret FROM vault.decrypted_secrets
  WHERE name = 'web_push_webhook_secret' LIMIT 1;
  IF webhook_secret IS NULL THEN
    RAISE WARNING 'Web Push webhook secret is missing; post remains saved';
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://cammbwzdpymunyobvszu.supabase.co/functions/v1/new-post-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-webhook-secret', webhook_secret),
    body := jsonb_build_object('type', 'INSERT', 'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW), 'old_record', NULL),
    timeout_milliseconds := 140000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never prevent publishing a post because a notification cannot be queued.
  RAISE WARNING 'Web Push could not be queued; post remains saved';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_new_post_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS team_art_new_post_push ON public.team_art_posts;
CREATE TRIGGER team_art_new_post_push AFTER INSERT ON public.team_art_posts
FOR EACH ROW EXECUTE FUNCTION public.notify_new_post_push();
DROP TRIGGER IF EXISTS team_art_own_comment_push ON public.team_art_comments;
CREATE TRIGGER team_art_own_comment_push AFTER INSERT ON public.team_art_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_post_push();
