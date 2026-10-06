-- Restore scenario editing for the authenticated owner of a campaign.
-- This is safe alongside the broader scenarios_owner_all policy and does not
-- grant access to scenarios owned by another Auth user.

GRANT SELECT, UPDATE ON public.scenarios TO authenticated;

DROP POLICY IF EXISTS "scenarios_owner_update" ON public.scenarios;
CREATE POLICY "scenarios_owner_update" ON public.scenarios
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = scenarios.campaign_id
      AND (c.owner_id = auth.uid() OR public.current_user_is_gm())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = scenarios.campaign_id
      AND (c.owner_id = auth.uid() OR public.current_user_is_gm())
  )
);

NOTIFY pgrst, 'reload schema';
