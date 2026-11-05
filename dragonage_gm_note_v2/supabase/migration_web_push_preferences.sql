-- Extend per-device subscriptions; leave existing board/Auth/Discord data intact.
BEGIN;
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS receive_new_posts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_own_comments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_teams boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS team_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS include_master_artwork boolean NOT NULL DEFAULT true;
GRANT UPDATE (receive_new_posts, receive_own_comments, all_teams, team_ids, include_master_artwork)
  ON public.push_subscriptions TO authenticated;

CREATE TABLE IF NOT EXISTS public.push_event_deliveries (
  event_type text NOT NULL CHECK (event_type IN ('post', 'comment')),
  event_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.team_art_posts(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (event_type, event_id, subscription_id)
);
ALTER TABLE public.push_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_event_deliveries FROM anon, authenticated;
GRANT ALL ON public.push_event_deliveries TO service_role;
INSERT INTO public.push_event_deliveries(event_type, event_id, post_id, subscription_id, claimed_at, sent_at)
SELECT 'post', post_id, post_id, subscription_id, claimed_at, sent_at FROM public.push_deliveries
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_push_event(p_event_type text, p_event_id uuid, p_post_id uuid, p_subscription_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH claimed AS (
    INSERT INTO public.push_event_deliveries (event_type, event_id, post_id, subscription_id)
    VALUES (p_event_type, p_event_id, p_post_id, p_subscription_id)
    ON CONFLICT (event_type, event_id, subscription_id) DO UPDATE SET claimed_at = now()
      WHERE public.push_event_deliveries.sent_at IS NULL
        AND public.push_event_deliveries.claimed_at < now() - interval '3 minutes'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_push_event(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_event(text, uuid, uuid, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.push_comments_are_shared()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_art_comments'
      AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE'
      AND 'authenticated' = ANY(roles) AND qual = 'true'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_art_comments'
      AND cmd IN ('SELECT', 'ALL') AND permissive = 'RESTRICTIVE'
      AND policyname <> 'inactive_player_guard'
      AND (roles && ARRAY['authenticated', 'public']::name[])
  );
$$;
REVOKE ALL ON FUNCTION public.push_comments_are_shared() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_comments_are_shared() TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
