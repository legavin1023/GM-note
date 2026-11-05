-- Run in SQL Editor. Existing board/auth/Discord policies are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 1 AND 4096),
  p256dh text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT UPDATE (user_id, endpoint, p256dh, auth) ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
DROP POLICY IF EXISTS push_subscriptions_owner ON public.push_subscriptions;
CREATE POLICY push_subscriptions_owner ON public.push_subscriptions
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Delivery receipts permit safe manual retries without re-sending successes.
CREATE TABLE IF NOT EXISTS public.push_deliveries (
  post_id uuid NOT NULL REFERENCES public.team_art_posts(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (post_id, subscription_id)
);
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_deliveries FROM anon, authenticated;
GRANT ALL ON public.push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_push_delivery(p_post_id uuid, p_subscription_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH claimed AS (
    INSERT INTO public.push_deliveries (post_id, subscription_id)
    VALUES (p_post_id, p_subscription_id)
    ON CONFLICT (post_id, subscription_id) DO UPDATE SET claimed_at = now()
      WHERE public.push_deliveries.sent_at IS NULL
        AND public.push_deliveries.claimed_at < now() - interval '3 minutes'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_push_delivery(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery(uuid, uuid) TO service_role;

-- The repository's final board policy grants all authenticated users read access.
-- Fail closed if the live DB still has team-only policies, or later adds restrictions.
-- This avoids bypassing board permissions by broadcasting via service_role.
CREATE OR REPLACE FUNCTION public.push_board_is_shared()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_art_posts'
      AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE'
      AND 'authenticated' = ANY(roles) AND qual = 'true'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_art_posts'
      AND cmd IN ('SELECT', 'ALL') AND permissive = 'RESTRICTIVE'
      AND policyname <> 'inactive_player_guard'
      AND (roles && ARRAY['authenticated', 'public']::name[])
  );
$$;
REVOKE ALL ON FUNCTION public.push_board_is_shared() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_board_is_shared() TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
