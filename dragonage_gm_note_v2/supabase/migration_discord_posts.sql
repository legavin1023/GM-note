-- Server-side board Discord delivery; Web Push and notice delivery remain.
BEGIN;
CREATE TABLE IF NOT EXISTS public.discord_post_deliveries (
 post_id uuid PRIMARY KEY REFERENCES public.team_art_posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 sent_at timestamptz,
 message_id text
);
ALTER TABLE public.discord_post_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_post_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.discord_post_deliveries TO service_role;
CREATE OR REPLACE FUNCTION public.claim_discord_post(p_post_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH claimed AS (UPDATE public.discord_post_deliveries SET claimed_at=now()
 WHERE post_id=p_post_id AND sent_at IS NULL
 AND (claimed_at IS NULL OR claimed_at<now()-interval '3 minutes') RETURNING 1)
 SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_discord_post(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discord_post(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.request_discord_posts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.discord_post_deliveries WHERE sent_at IS NULL AND created_at>now()-interval '24 hours') THEN
  PERFORM net.http_post(url:='https://cammbwzdpymunyobvszu.supabase.co/functions/v1/discord-posts',headers:=jsonb_build_object('Content-Type','application/json','x-push-webhook-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='web_push_webhook_secret' LIMIT 1)),body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=100000);
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.request_discord_posts() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.enqueue_discord_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.discord_post_deliveries(post_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 BEGIN PERFORM public.request_discord_posts(); EXCEPTION WHEN OTHERS THEN RAISE LOG 'Discord notice wakeup failed; cron will retry'; END;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_discord_post() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS "discord-posts-notification" ON public.team_art_posts;
CREATE TRIGGER "discord-posts-notification" AFTER INSERT ON public.team_art_posts FOR EACH ROW EXECUTE FUNCTION public.enqueue_discord_post();
SELECT cron.schedule('discord-post-retry','* * * * *','SELECT public.request_discord_posts();');
-- Preserve the independent notice retry job during upgrade.
SELECT cron.schedule('discord-notice-retry','* * * * *','SELECT public.request_discord_notices();');
COMMIT;
