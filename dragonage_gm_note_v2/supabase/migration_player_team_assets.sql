-- Players can read non-secret character profiles and gallery images for every
-- team in their campaign.
-- Public team-profile edits are applied through a field-whitelisted RPC.

CREATE OR REPLACE FUNCTION public.player_character_context()
RETURNS TABLE(team_id uuid, campaign_id uuid, character_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.campaign_id, u.id
  FROM public.player_team_members m
  JOIN public.users u ON u.username = m.login_username
  JOIN public.teams t ON t.id = u.team_id
  WHERE m.user_id = auth.uid()
    AND u.team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users other_user
      WHERE other_user.username = m.login_username
        AND other_user.team_id IS DISTINCT FROM u.team_id
    )
  ORDER BY u.created_at NULLS LAST
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.player_character_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_character_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.player_team_profiles()
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'team_id', u.team_id,
    'character_name', u.character_name, 'player', u.player,
    'token_url', u.token_url, 'level', u.level, 'age', u.age, 'height', u.height,
    'weight', u.weight, 'race', u.race, 'background', u.background,
    'social_class', u.social_class, 'class', u.class, 'motivation', u.motivation,
    'goal', u.goal, 'strengths', u.strengths,
    'languages', u.languages, 'traits', u.traits,
    'character_quirk', u.character_quirk, 'biography', u.biography
  )
  FROM public.users u
  JOIN public.teams t ON t.id = u.team_id
  WHERE t.campaign_id IN (SELECT campaign_id FROM public.player_team_context())
$$;
REVOKE ALL ON FUNCTION public.player_team_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_profiles() TO authenticated;

-- Include legacy token rows linked by character_id even when older rows have
-- a NULL or stale team_id. The RPC derives the allowed campaign from auth.uid().
CREATE OR REPLACE FUNCTION public.player_team_gallery_images()
RETURNS TABLE(
  id uuid, team_id uuid, character_id uuid, url text,
  caption text, owner_label text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH player_scope AS (
    SELECT campaign_id FROM public.player_character_context() LIMIT 1
  )
  SELECT i.id, COALESCE(character_team.id, i.team_id), i.character_id, i.url,
    CASE
      WHEN i.caption = '__character_token__'
        THEN COALESCE(NULLIF(u.character_name, ''), '캐릭터 토큰')
      ELSE i.caption
    END,
    COALESCE(NULLIF(i.owner_label, ''), u.player, ''),
    i.created_at
  FROM public.images i
  CROSS JOIN player_scope
  LEFT JOIN public.users u
    ON u.id = i.character_id
  LEFT JOIN public.teams character_team
    ON character_team.id = u.team_id
  WHERE EXISTS (
      SELECT 1 FROM public.teams image_team
      WHERE image_team.id = i.team_id
        AND image_team.campaign_id = player_scope.campaign_id
    )
    OR character_team.campaign_id = player_scope.campaign_id
    OR (i.campaign_id = player_scope.campaign_id
        AND i.team_id IS NULL AND i.character_id IS NULL)

  UNION ALL

  -- The character card reads users.token_url directly. Return that same
  -- source for every character in this player's campaign.
  SELECT u.id, u.team_id, u.id, u.token_url,
    COALESCE(NULLIF(u.character_name, ''), '캐릭터 토큰'),
    COALESCE(u.player, ''),
    NULL::timestamptz
  FROM public.users u
  JOIN public.teams t ON t.id = u.team_id
  CROSS JOIN player_scope
  WHERE t.campaign_id = player_scope.campaign_id
    AND NULLIF(btrim(u.token_url), '') IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.player_team_gallery_images() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_team_gallery_images() TO authenticated;

CREATE OR REPLACE FUNCTION public.player_update_team_profile(p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_team_id uuid;
  submitted_keys text[];
  allowed_keys text[] := ARRAY['name', 'region', 'description', 'color'];
  updated_row public.teams%ROWTYPE;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Team profile updates must be an object';
  END IF;

  SELECT array_agg(k) INTO submitted_keys
  FROM jsonb_object_keys(p_updates) AS keys(k);
  IF submitted_keys IS NULL OR cardinality(submitted_keys) = 0
     OR NOT (submitted_keys <@ allowed_keys) THEN
    RAISE EXCEPTION 'One or more team profile fields cannot be changed';
  END IF;

  SELECT pc.team_id INTO current_team_id
  FROM public.player_team_context() pc;
  IF current_team_id IS NULL THEN
    RAISE EXCEPTION 'No team is connected to this player account';
  END IF;

  UPDATE public.teams t SET
    name = CASE WHEN p_updates ? 'name' THEN COALESCE(p_updates->>'name', t.name) ELSE t.name END,
    region = CASE WHEN p_updates ? 'region' THEN COALESCE(p_updates->>'region', '') ELSE t.region END,
    description = CASE WHEN p_updates ? 'description' THEN COALESCE(p_updates->>'description', '') ELSE t.description END,
    color = CASE WHEN p_updates ? 'color' THEN COALESCE(p_updates->>'color', t.color) ELSE t.color END
  WHERE t.id = current_team_id
  RETURNING * INTO updated_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team profile could not be updated';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_row.id,
    'name', updated_row.name,
    'region', updated_row.region,
    'description', updated_row.description,
    'color', updated_row.color
  );
END;
$$;
REVOKE ALL ON FUNCTION public.player_update_team_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_update_team_profile(jsonb) TO authenticated;

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "images_player_team_read" ON public.images;
CREATE POLICY "images_player_team_read" ON public.images
FOR SELECT TO authenticated
USING (
  campaign_id IN (SELECT campaign_id FROM public.player_team_context())
  OR team_id IN (
    SELECT t.id FROM public.teams t
    WHERE t.campaign_id IN (SELECT campaign_id FROM public.player_team_context())
  )
);

GRANT SELECT ON public.images TO authenticated;

NOTIFY pgrst, 'reload schema';
