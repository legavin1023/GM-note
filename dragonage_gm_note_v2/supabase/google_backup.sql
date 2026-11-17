-- Additive backup infrastructure. Existing tables, content and RLS stay intact.
-- Run as postgres in SQL Editor after deploying google-backup and configuring Vault.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.gm_backup_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  last_error_code text
);
CREATE INDEX IF NOT EXISTS gm_backup_pending ON public.gm_backup_events(id) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS public.gm_backup_state (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  dataset_id uuid NOT NULL DEFAULT gen_random_uuid(),
  bootstrapped_at timestamptz,
  claim_token uuid,
  lease_until timestamptz
);
CREATE TABLE IF NOT EXISTS public.gm_backup_sources (
  source_schema text NOT NULL,source_table text NOT NULL,seeded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_schema,source_table)
);
INSERT INTO public.gm_backup_state(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.gm_backup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_backup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_backup_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gm_backup_events,public.gm_backup_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.gm_backup_events,public.gm_backup_state TO service_role;
REVOKE ALL ON public.gm_backup_sources FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.gm_backup_sources TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.gm_backup_events_id_seq TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='dragonage_weekly_backup') THEN
   GRANT SELECT ON public.gm_backup_events,public.gm_backup_state,public.gm_backup_sources TO dragonage_weekly_backup;
   GRANT SELECT ON SEQUENCE public.gm_backup_events_id_seq TO dragonage_weekly_backup;
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.gm_backup_key(p_relation oid,p_row jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(jsonb_object_agg(a.attname,p_row->a.attname),
   jsonb_build_object('_row_hash',md5(p_row::text)))
 FROM pg_catalog.pg_index i
 JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,position) ON k.position<=i.indnkeyatts
 JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
 WHERE i.indrelid=p_relation AND i.indisprimary;
$$;
REVOKE ALL ON FUNCTION public.gm_backup_key(oid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.request_google_backup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; secret text; stamp text; nonce text; signature text;
BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='gm_backup_edge_url' LIMIT 1;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='gm_backup_webhook_secret' LIMIT 1;
 IF endpoint IS NULL OR secret IS NULL THEN RETURN; END IF;
 IF endpoint !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/google-backup$' THEN RAISE EXCEPTION 'Invalid backup endpoint'; END IF;
 stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 nonce:=gen_random_uuid()::text;
 signature:=encode(extensions.hmac(stamp||'.'||nonce,secret,'sha256'),'hex');
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json',
   'x-backup-timestamp',stamp,'x-backup-nonce',nonce,'x-backup-signature',signature),
   body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=100000);
END; $$;
REVOKE ALL ON FUNCTION public.request_google_backup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_google_backup() TO service_role;

CREATE OR REPLACE FUNCTION public.gm_backup_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior jsonb; current_row jsonb; dataset uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN prior:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN current_row:=to_jsonb(NEW); END IF;
 SELECT dataset_id INTO dataset FROM public.gm_backup_state WHERE id;
 INSERT INTO public.gm_backup_events(payload) VALUES(jsonb_build_object(
   'dataset',dataset,'schema',TG_TABLE_SCHEMA,'table',TG_TABLE_NAME,'op',TG_OP,
   'key',public.gm_backup_key(TG_RELID,COALESCE(current_row,prior)),
   'oldKey',CASE WHEN prior IS NOT NULL THEN public.gm_backup_key(TG_RELID,prior) END,
   'before',prior,'after',current_row,'at',clock_timestamp()));
 -- Capture is transactional. A committed app change always has a durable event.
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.gm_backup_capture() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gm_backup_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('gm_backup.wake_sent',true) IS DISTINCT FROM 'yes' THEN
   PERFORM set_config('gm_backup.wake_sent','yes',true);
   BEGIN PERFORM public.request_google_backup();
   EXCEPTION WHEN OTHERS THEN RAISE LOG 'Google backup wakeup deferred; queued events retained'; END;
 END IF;
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.gm_backup_wake() FROM PUBLIC,anon,authenticated;

-- Attach only to existing ordinary application tables and Storage metadata.
-- Delivery tables also get archived, but the backup's own queue never does.
DO $$ DECLARE t record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname !~ '^gm_backup_')
     OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))
     OR (n.nspname='auth' AND c.relname IN ('users','identities'))) ORDER BY n.nspname,c.relname
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=format('%I.%I',t.nspname,t.relname)::regclass AND i.indisprimary) THEN
     RAISE EXCEPTION 'Backup requires a primary key on %.%; no changes committed',t.nspname,t.relname;
   END IF;
   EXECUTE format('DROP TRIGGER IF EXISTS gm_backup_capture ON %I.%I',t.nspname,t.relname);
   EXECUTE format('CREATE TRIGGER gm_backup_capture AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.gm_backup_capture()',t.nspname,t.relname);
   EXECUTE format('DROP TRIGGER IF EXISTS gm_backup_wake ON %I.%I',t.nspname,t.relname);
   EXECUTE format('CREATE TRIGGER gm_backup_wake AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.gm_backup_wake()',t.nspname,t.relname);
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_google_backup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.gm_backup_state%ROWTYPE; token uuid; batch jsonb;
BEGIN
 SELECT * INTO state FROM public.gm_backup_state WHERE id FOR UPDATE;
 IF state.lease_until>now() THEN RETURN NULL; END IF;
 token:=gen_random_uuid();
 WITH chosen AS (SELECT id FROM public.gm_backup_events WHERE delivered_at IS NULL
   AND next_attempt_at<=now() ORDER BY CASE
     WHEN payload->>'op'<>'SNAPSHOT' THEN 0
     WHEN payload->>'schema'='storage' AND payload->>'table'='objects' THEN 1
     WHEN payload->>'schema'='public' AND payload->>'table' IN
       ('users','images','team_art_posts','team_art_comments','free_board_posts','free_board_comments','scenario_npcs') THEN 2
     WHEN payload->>'table'='app_activity_logs' THEN 4
     ELSE 3 END,id LIMIT 1 FOR UPDATE),
 claimed AS (UPDATE public.gm_backup_events e SET claim_token=token,attempts=e.attempts+1
   FROM chosen WHERE e.id=chosen.id RETURNING e.*)
 SELECT jsonb_agg(jsonb_build_object('sequence',id::text,'eventId',event_id,'payload',payload) ORDER BY id) INTO batch FROM claimed;
 IF batch IS NULL THEN RETURN NULL; END IF;
 UPDATE public.gm_backup_state SET claim_token=token,lease_until=now()+interval '3 minutes' WHERE id;
 RETURN jsonb_build_object('token',token,'events',batch);
END; $$;
REVOKE ALL ON FUNCTION public.claim_google_backup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_backup() TO service_role;

CREATE OR REPLACE FUNCTION public.finish_google_backup(p_token uuid,p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;
BEGIN
 PERFORM 1 FROM public.gm_backup_state WHERE id AND claim_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
   UPDATE public.gm_backup_events SET
     delivered_at=CASE WHEN (item->>'ok')::boolean THEN now() ELSE NULL END,
     last_error_code=CASE WHEN (item->>'ok')::boolean THEN NULL ELSE
       CASE WHEN item->>'code' ~ '^[A-Z_]{1,80}$' THEN item->>'code' ELSE 'DELIVERY_FAILED' END END,
     next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7)))::integer)
   WHERE event_id=(item->>'eventId')::uuid AND claim_token=p_token AND delivered_at IS NULL;
 END LOOP;
 UPDATE public.gm_backup_state SET claim_token=NULL,lease_until=NULL WHERE id AND claim_token=p_token;
END; $$;
REVOKE ALL ON FUNCTION public.finish_google_backup(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_google_backup(uuid,jsonb) TO service_role;

-- One initial snapshot of ALL existing application rows + every Storage object.
-- Reapplying this migration will not enqueue another full snapshot.
DO $$ DECLARE t record; dataset uuid;
BEGIN
 SELECT dataset_id INTO dataset FROM public.gm_backup_state WHERE id FOR UPDATE;
   FOR t IN SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname !~ '^gm_backup_')
       OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))
       OR (n.nspname='auth' AND c.relname IN ('users','identities'))) ORDER BY n.nspname,c.relname
   LOOP
     IF EXISTS(SELECT 1 FROM public.gm_backup_sources WHERE source_schema=t.nspname AND source_table=t.relname) THEN CONTINUE; END IF;
     EXECUTE format('INSERT INTO public.gm_backup_events(payload)
       SELECT jsonb_build_object(''dataset'',$1,''schema'',$2,''table'',$3,''op'',''SNAPSHOT'',
         ''key'',public.gm_backup_key($4,to_jsonb(t)),''before'',NULL,''after'',to_jsonb(t),''at'',now()) FROM %I.%I t',t.nspname,t.relname)
       USING dataset,t.nspname,t.relname,t.oid;
     INSERT INTO public.gm_backup_sources(source_schema,source_table) VALUES(t.nspname,t.relname);
   END LOOP;
   UPDATE public.gm_backup_state SET bootstrapped_at=COALESCE(bootstrapped_at,now()) WHERE id;
END; $$;

-- Single retry tick; successful events and historical versions are never pruned.
DO $$ DECLARE job bigint;
BEGIN
 FOR job IN SELECT jobid FROM cron.job WHERE jobname='gm-google-backup-retry' LOOP PERFORM cron.unschedule(job); END LOOP;
END; $$;
SELECT cron.schedule('gm-google-backup-retry','* * * * *',
  'SELECT public.request_google_backup() WHERE EXISTS(SELECT 1 FROM public.gm_backup_events WHERE delivered_at IS NULL AND next_attempt_at<=now());');
SELECT public.request_google_backup();
COMMIT;
NOTIFY pgrst,'reload schema';
