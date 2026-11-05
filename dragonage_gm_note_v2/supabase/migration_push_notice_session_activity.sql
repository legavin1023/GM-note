BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
ALTER TABLE public.push_subscriptions
 ADD COLUMN IF NOT EXISTS receive_notices boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS receive_session_reminders boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS receive_activity boolean NOT NULL DEFAULT false;
GRANT UPDATE(receive_notices,receive_session_reminders,receive_activity) ON public.push_subscriptions TO authenticated;

CREATE TABLE IF NOT EXISTS public.team_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 starts_at timestamptz NOT NULL,
 cancelled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_sessions_upcoming ON public.team_sessions(starts_at) WHERE NOT cancelled;
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.team_sessions TO authenticated;
DROP POLICY IF EXISTS team_sessions_read ON public.team_sessions;
CREATE POLICY team_sessions_read ON public.team_sessions FOR SELECT TO authenticated USING (
 public.current_user_is_gm() OR team_id IN (SELECT team_id FROM public.player_team_context())
);
DROP POLICY IF EXISTS team_sessions_gm ON public.team_sessions;
CREATE POLICY team_sessions_gm ON public.team_sessions FOR ALL TO authenticated USING(public.current_user_is_gm()) WITH CHECK(public.current_user_is_gm());

CREATE TABLE IF NOT EXISTS public.campaign_push_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('notice','session','activity')),
 source_id text NOT NULL,
 session_starts_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 processing_at timestamptz,
 expires_at timestamptz NOT NULL,
 UNIQUE(kind,source_id,session_starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_push_events_immediate ON public.campaign_push_events(kind,source_id) WHERE session_starts_at IS NULL;
ALTER TABLE public.campaign_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_push_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_push_events TO service_role;
CREATE OR REPLACE FUNCTION public.claim_campaign_event(p_event_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH claimed AS (UPDATE public.campaign_push_events SET processing_at=now()
 WHERE id=p_event_id AND completed_at IS NULL AND expires_at>now()
 AND (processing_at IS NULL OR processing_at<now()-interval '3 minutes') RETURNING 1)
 SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_campaign_event(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_event(uuid) TO service_role;
CREATE TABLE IF NOT EXISTS public.campaign_push_deliveries (
 event_id uuid NOT NULL REFERENCES public.campaign_push_events(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 PRIMARY KEY(event_id,subscription_id)
);
ALTER TABLE public.campaign_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_push_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_campaign_push(p_event_id uuid,p_subscription_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH claimed AS (
  INSERT INTO public.campaign_push_deliveries(event_id,subscription_id) VALUES(p_event_id,p_subscription_id)
  ON CONFLICT(event_id,subscription_id) DO UPDATE SET claimed_at=now()
   WHERE public.campaign_push_deliveries.sent_at IS NULL AND public.campaign_push_deliveries.claimed_at < now()-interval '3 minutes'
  RETURNING 1
 ) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_campaign_push(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_push(uuid,uuid) TO service_role;

-- Authorization is enforced again on the server, regardless of the UI checkbox.
CREATE OR REPLACE FUNCTION public.campaign_push_recipients(p_kind text,p_team_id uuid,p_cursor uuid DEFAULT NULL)
RETURNS SETOF public.push_subscriptions LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT s.* FROM public.push_subscriptions s
 WHERE (p_cursor IS NULL OR s.id>p_cursor)
 AND CASE p_kind
  WHEN 'notice' THEN s.receive_notices
  WHEN 'activity' THEN s.receive_activity AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=s.user_id AND lower(btrim(u.role))='admin')
  WHEN 'session' THEN s.receive_session_reminders
   AND (s.all_teams OR p_team_id=ANY(s.team_ids))
   AND (EXISTS(SELECT 1 FROM public.users u WHERE u.id=s.user_id AND lower(btrim(u.role))='admin')
     OR EXISTS(SELECT 1 FROM public.player_team_members m
       JOIN public.users u ON u.username=m.login_username
       JOIN public.teams t ON t.id=u.team_id
       WHERE m.user_id=s.user_id AND t.id=p_team_id
       AND NOT EXISTS(SELECT 1 FROM public.users other_user WHERE other_user.username=m.login_username AND other_user.team_id IS DISTINCT FROM u.team_id)))
  ELSE false END
 ORDER BY s.id LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.campaign_push_recipients(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_push_recipients(text,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_campaign_push()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='web_push_webhook_secret' LIMIT 1;
 IF secret IS NULL THEN RAISE EXCEPTION 'Missing Web Push Vault secret'; END IF;
 PERFORM net.http_post(url:='https://cammbwzdpymunyobvszu.supabase.co/functions/v1/campaign-push',
 headers:=jsonb_build_object('Content-Type','application/json','x-push-webhook-secret',secret),body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=100000);
END; $$;
REVOKE ALL ON FUNCTION public.request_campaign_push() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='notices' THEN
  INSERT INTO public.campaign_push_events(kind,source_id,expires_at) VALUES('notice',NEW.id::text,now()+interval '24 hours') ON CONFLICT DO NOTHING;
 ELSE
  INSERT INTO public.campaign_push_events(kind,source_id,expires_at) VALUES('activity',NEW.id::text,now()+interval '30 minutes') ON CONFLICT DO NOTHING;
 END IF;
 -- HTTP is asynchronous; external outages never break the original write.
 BEGIN PERFORM public.request_campaign_push(); EXCEPTION WHEN OTHERS THEN RAISE LOG 'Campaign push wakeup failed; cron will retry'; END;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_campaign_push() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notices_web_push ON public.notices;
CREATE TRIGGER notices_web_push AFTER INSERT ON public.notices FOR EACH ROW EXECUTE FUNCTION public.enqueue_campaign_push();
DROP TRIGGER IF EXISTS activity_web_push ON public.app_activity_logs;
CREATE TRIGGER activity_web_push AFTER INSERT ON public.app_activity_logs FOR EACH ROW EXECUTE FUNCTION public.enqueue_campaign_push();

CREATE OR REPLACE FUNCTION public.tick_campaign_push()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.campaign_push_events(kind,source_id,session_starts_at,expires_at)
 SELECT 'session',id::text,starts_at,starts_at FROM public.team_sessions
 WHERE NOT cancelled AND starts_at>now() AND starts_at<=now()+interval '10 minutes'
 ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.campaign_push_events WHERE completed_at IS NULL AND expires_at>now()) THEN PERFORM public.request_campaign_push(); END IF;
 DELETE FROM public.campaign_push_events WHERE expires_at<now()-interval '30 days';
END; $$;
REVOKE ALL ON FUNCTION public.tick_campaign_push() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('campaign-session-push','* * * * *','SELECT public.tick_campaign_push();');
COMMIT;
NOTIFY pgrst,'reload schema';
