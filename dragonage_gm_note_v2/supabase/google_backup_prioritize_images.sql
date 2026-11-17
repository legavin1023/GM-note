-- Change delivery order only. Retain every pending record and original file.
-- New changes first, then original images, then content, then activity history.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_google_backup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.gm_backup_state%ROWTYPE; token uuid; batch jsonb;
BEGIN
 SELECT * INTO state FROM public.gm_backup_state WHERE id FOR UPDATE;
 IF state.lease_until>now() THEN RETURN NULL; END IF;
 token:=gen_random_uuid();
 WITH chosen AS (
   SELECT id FROM public.gm_backup_events
   WHERE delivered_at IS NULL AND next_attempt_at<=now()
   ORDER BY CASE
     WHEN payload->>'op'<>'SNAPSHOT' THEN 0
     WHEN payload->>'schema'='storage' AND payload->>'table'='objects' THEN 1
     WHEN payload->>'schema'='public' AND payload->>'table' IN
       ('users','images','team_art_posts','team_art_comments','free_board_posts','free_board_comments','scenario_npcs') THEN 2
     WHEN payload->>'table'='app_activity_logs' THEN 4
     ELSE 3 END,id
   LIMIT 1 FOR UPDATE
 ), claimed AS (
   UPDATE public.gm_backup_events e SET claim_token=token,attempts=e.attempts+1
   FROM chosen WHERE e.id=chosen.id RETURNING e.*
 )
 SELECT jsonb_agg(jsonb_build_object('sequence',id::text,'eventId',event_id,'payload',payload) ORDER BY id) INTO batch FROM claimed;
 IF batch IS NULL THEN RETURN NULL; END IF;
 UPDATE public.gm_backup_state SET claim_token=token,lease_until=now()+interval '3 minutes' WHERE id;
 RETURN jsonb_build_object('token',token,'events',batch);
END; $$;
REVOKE ALL ON FUNCTION public.claim_google_backup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_backup() TO service_role;
SELECT public.request_google_backup();
COMMIT;
