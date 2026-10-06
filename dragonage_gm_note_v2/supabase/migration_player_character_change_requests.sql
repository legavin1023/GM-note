-- Players can request edits to their own public character profile. Changes are
-- applied only after the owning GM approves them.

CREATE TABLE IF NOT EXISTS public.player_character_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  requested_changes jsonb NOT NULL CHECK (jsonb_typeof(requested_changes) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS player_character_change_one_pending
  ON public.player_character_change_requests(character_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS player_character_change_team_pending
  ON public.player_character_change_requests(team_id, created_at DESC)
  WHERE status = 'pending';
ALTER TABLE public.player_character_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_character_change_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.player_submit_character_change(p_changes jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_character_id uuid;
  current_team_id uuid;
  request_id uuid;
  allowed_keys text[] := ARRAY[
    'character_name', 'age', 'height', 'weight', 'race', 'background',
    'social_class', 'class', 'motivation', 'goal', 'strengths', 'languages',
    'traits', 'character_quirk', 'biography', 'token_url'
  ];
  submitted_keys text[];
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Profile changes must be an object';
  END IF;

  SELECT array_agg(k) INTO submitted_keys
  FROM jsonb_object_keys(p_changes) AS keys(k);
  IF submitted_keys IS NULL OR cardinality(submitted_keys) = 0
     OR submitted_keys && ARRAY['gm_secret', 'player_gm_secret', 'gm_unknown_secret', 'doom']
     OR NOT (submitted_keys <@ allowed_keys) THEN
    RAISE EXCEPTION 'One or more profile fields cannot be changed';
  END IF;

  SELECT pc.character_id, pc.team_id
    INTO current_character_id, current_team_id
  FROM public.player_character_context() pc
  LIMIT 1;
  IF current_character_id IS NULL THEN
    RAISE EXCEPTION 'No character is connected to this player account';
  END IF;

  INSERT INTO public.player_character_change_requests
    (user_id, character_id, team_id, requested_changes)
  VALUES (auth.uid(), current_character_id, current_team_id, p_changes)
  RETURNING id INTO request_id;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_submit_character_change(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_submit_character_change(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.player_character_change_status()
RETURNS TABLE(request_id uuid, status text, requested_changes jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.status, r.requested_changes, r.created_at
  FROM public.player_character_change_requests r
  WHERE r.user_id = auth.uid()
    AND r.status = 'pending'
  ORDER BY r.created_at DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.player_character_change_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_character_change_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_team_character_change_requests(p_team_id uuid)
RETURNS TABLE(request_id uuid, character_id uuid, character_name text, player text,
  requested_changes jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
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
REVOKE ALL ON FUNCTION public.list_team_character_change_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_character_change_requests(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_player_character_change(
  p_request_id uuid, p_approve boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
    -- Empty form values arrive as JSON strings. Convert them to JSON null so
    -- numeric columns (such as age) clear cleanly instead of trying to cast
    -- an empty string to integer. Fields omitted from the request stay intact.
    SELECT pg_catalog.jsonb_object_agg(
      entry.key,
      CASE
        WHEN pg_catalog.jsonb_typeof(entry.value) = 'string'
          AND entry.value #>> '{}' = ''
          THEN 'null'::jsonb
        ELSE entry.value
      END
    )
    INTO changes
    FROM pg_catalog.jsonb_each(changes) AS entry(key, value);

    -- Start from the current row so fields absent from the request remain
    -- unchanged. jsonb_populate_record applies each JSON value using the
    -- corresponding users column type.
    SELECT u.* INTO requested
    FROM public.users u
    WHERE u.id = request_row.character_id
      AND u.team_id = request_row.team_id
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
REVOKE ALL ON FUNCTION public.review_player_character_change(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_player_character_change(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
