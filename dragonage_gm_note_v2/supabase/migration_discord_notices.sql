-- Replaces only the broken notice webhook. Board watcher and Web Push remain.
BEGIN;
CREATE TABLE IF NOT EXISTS public.discord_notice_deliveries (
 notice_id uuid PRIMARY KEY REFERENCES public.notices(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 sent_at timestamptz,
 message_id text
);
ALTER TABLE public.discord_notice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_notice_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.discord_notice_deliveries TO service_role;
CREATE OR REPLACE FUNCTION public.claim_discord_notice(p_notice_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH claimed AS (UPDATE public.discord_notice_deliveries SET claimed_at=now()
 WHERE notice_id=p_notice_id AND sent_at IS NULL
 AND (claimed_at IS NULL OR claimed_at<now()-interval '3 minutes') RETURNING 1)
 SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_discord_notice(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discord_notice(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.request_discord_notices()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.discord_notice_deliveries WHERE sent_at IS NULL AND created_at>now()-interval '24 hours') THEN
  PERFORM net.http_post(url:='https://cammbwzdpymunyobvszu.supabase.co/functions/v1/discord-notices',headers:=jsonb_build_object('Content-Type','application/json','x-push-webhook-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='web_push_webhook_secret' LIMIT 1)),body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=100000);
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.request_discord_notices() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.enqueue_discord_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.discord_notice_deliveries(notice_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 BEGIN PERFORM public.request_discord_notices(); EXCEPTION WHEN OTHERS THEN RAISE LOG 'Discord notice wakeup failed; cron will retry'; END;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_discord_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS "discord-notices-notification" ON public.notices;
CREATE TRIGGER "discord-notices-notification" AFTER INSERT ON public.notices FOR EACH ROW EXECUTE FUNCTION public.enqueue_discord_notice();
SELECT cron.schedule('discord-notice-retry','* * * * *','SELECT public.request_discord_notices();');
-- Recover only the latest notice published within 24 hours, not the whole archive.
INSERT INTO public.discord_notice_deliveries(notice_id)
SELECT id FROM public.notices WHERE created_at>now()-interval '24 hours' ORDER BY created_at DESC,id DESC LIMIT 1
ON CONFLICT DO NOTHING;
SELECT public.request_discord_notices();
COMMIT;
