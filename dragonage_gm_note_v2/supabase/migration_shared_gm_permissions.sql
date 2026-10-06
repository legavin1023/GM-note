-- Share the manager role between apps using this Supabase project.
-- The manager's public.users.id must match their auth.users.id.

CREATE OR REPLACE FUNCTION public.current_user_is_gm()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND lower(btrim(COALESCE(to_jsonb(u)->>'role', ''))) = 'admin'
  )
$$;
ALTER FUNCTION public.current_user_is_gm() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_user_is_gm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_gm() TO authenticated;

-- Allow a shared GM to review character edit requests across campaigns.
CREATE OR REPLACE FUNCTION public.list_team_character_change_requests(p_team_id uuid)
RETURNS TABLE(request_id uuid, character_id uuid, character_name text, player text,
  requested_changes jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.campaigns c ON c.id = t.campaign_id
    WHERE t.id = p_team_id
      AND (c.owner_id = auth.uid() OR public.current_user_is_gm())
  ) THEN
    RAISE EXCEPTION 'Not authorized to review these requests';
  END IF;

  RETURN QUERY
  SELECT r.id, r.character_id, u.character_name, u.player,
    r.requested_changes, r.created_at
  FROM public.player_character_change_requests r
  JOIN public.users u ON u.id = r.character_id
  WHERE r.team_id = p_team_id AND r.status = 'pending'
  ORDER BY r.created_at;
END;
$$;
ALTER FUNCTION public.list_team_character_change_requests(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_team_character_change_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_character_change_requests(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_player_character_change(
  p_request_id uuid, p_approve boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  request_row public.player_character_change_requests%ROWTYPE;
  changes jsonb;
  requested public.users%ROWTYPE;
BEGIN
  SELECT r.* INTO request_row
  FROM public.player_character_change_requests r
  JOIN public.teams t ON t.id = r.team_id
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE r.id = p_request_id
    AND (c.owner_id = auth.uid() OR public.current_user_is_gm())
  FOR UPDATE OF r;
  IF NOT FOUND OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;

  IF p_approve THEN
    changes := request_row.requested_changes;
    SELECT pg_catalog.jsonb_object_agg(
      entry.key,
      CASE
        WHEN pg_catalog.jsonb_typeof(entry.value) = 'string'
          AND entry.value #>> '{}' = '' THEN 'null'::jsonb
        ELSE entry.value
      END
    ) INTO changes
    FROM pg_catalog.jsonb_each(changes) AS entry(key, value);

    SELECT u.* INTO requested
    FROM public.users u
    WHERE u.id = request_row.character_id AND u.team_id = request_row.team_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Character no longer belongs to this team'; END IF;

    SELECT * INTO requested
    FROM pg_catalog.jsonb_populate_record(requested, changes);

    UPDATE public.users u SET
      character_name = requested.character_name,
      age = requested.age,
      height = requested.height,
      weight = requested.weight,
      race = requested.race,
      background = requested.background,
      social_class = requested.social_class,
      class = requested.class,
      motivation = requested.motivation,
      goal = requested.goal,
      strengths = requested.strengths,
      languages = requested.languages,
      traits = requested.traits,
      character_quirk = requested.character_quirk,
      biography = requested.biography,
      token_url = requested.token_url
    WHERE u.id = request_row.character_id AND u.team_id = request_row.team_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Character no longer belongs to this team'; END IF;
  END IF;

  UPDATE public.player_character_change_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_at = now(), decided_by = auth.uid()
  WHERE id = p_request_id;
END;
$$;
ALTER FUNCTION public.review_player_character_change(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_player_character_change(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_player_character_change(uuid, boolean) TO authenticated;

-- Add shared-GM access while retaining each existing campaign owner's access.
DROP POLICY IF EXISTS "campaigns_shared_gm_all" ON public.campaigns;
CREATE POLICY "campaigns_shared_gm_all" ON public.campaigns
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "teams_shared_gm_all" ON public.teams;
CREATE POLICY "teams_shared_gm_all" ON public.teams
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "users_shared_gm_all" ON public.users;
CREATE POLICY "users_shared_gm_all" ON public.users
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "scenarios_shared_gm_all" ON public.scenarios;
CREATE POLICY "scenarios_shared_gm_all" ON public.scenarios
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "scenario_questions_shared_gm_all" ON public.scenario_questions;
CREATE POLICY "scenario_questions_shared_gm_all" ON public.scenario_questions
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "question_choices_shared_gm_all" ON public.question_choices;
CREATE POLICY "question_choices_shared_gm_all" ON public.question_choices
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "team_scenarios_shared_gm_all" ON public.team_scenarios;
CREATE POLICY "team_scenarios_shared_gm_all" ON public.team_scenarios
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "team_scenario_answers_shared_gm_all" ON public.team_scenario_answers;
CREATE POLICY "team_scenario_answers_shared_gm_all" ON public.team_scenario_answers
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "images_shared_gm_all" ON public.images;
CREATE POLICY "images_shared_gm_all" ON public.images
FOR ALL TO authenticated USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

DROP POLICY IF EXISTS "team_scenario_gm_notes_shared_gm_all"
  ON public.team_scenario_gm_notes;
CREATE POLICY "team_scenario_gm_notes_shared_gm_all"
ON public.team_scenario_gm_notes FOR ALL TO authenticated
USING (public.current_user_is_gm())
WITH CHECK (public.current_user_is_gm());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns, public.teams,
  public.users, public.scenarios, public.scenario_questions,
  public.question_choices, public.team_scenarios, public.team_scenario_answers,
  public.images, public.team_scenario_gm_notes TO authenticated;

NOTIFY pgrst, 'reload schema';
