-- Apply after migration_dashboard_activity_log.sql.
-- New NPC rating/comment activity records include the NPC name.
-- Old activity rows have no npc_id and cannot be safely backfilled.
BEGIN;

CREATE OR REPLACE FUNCTION public.capture_app_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  row_data jsonb;
  actor_type_value text;
  actor_label_value text;
  feature_value text;
  entity_label_value text;
  team_id_value uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  team_id_value := NULLIF(row_data->>'team_id', '')::uuid;

  IF public.current_user_is_gm() THEN
    actor_type_value := 'master';
    SELECT COALESCE(NULLIF(u.username, ''), NULLIF(u.character_name, ''), '마스터')
      INTO actor_label_value
    FROM public.users u WHERE u.id = auth.uid();
    actor_label_value := COALESCE(actor_label_value, '마스터');
  ELSIF EXISTS (SELECT 1 FROM public.player_character_context()) THEN
    actor_type_value := 'player';
    SELECT COALESCE(NULLIF(u.character_name, ''), NULLIF(u.username, ''), '플레이어')
      INTO actor_label_value
    FROM public.player_team_members m
    JOIN public.users u ON u.username = m.login_username
    WHERE m.user_id = auth.uid()
    ORDER BY u.id
    LIMIT 1;
    actor_label_value := COALESCE(actor_label_value, '플레이어');
  ELSE
    actor_type_value := 'user';
    actor_label_value := '사용자';
  END IF;

  feature_value := CASE
    WHEN TG_TABLE_SCHEMA = 'storage' THEN CASE row_data->>'bucket_id'
      WHEN 'free-board-images' THEN '작품 이미지'
      WHEN 'team-log-backups' THEN '팀 로그 백업'
      WHEN 'campaign-assets' THEN '캠페인 이미지'
      ELSE '파일 저장소' END
    WHEN TG_TABLE_NAME IN ('team_scenarios','team_scenario_answers','team_scenario_gm_notes') THEN '시나리오 트래커'
    WHEN TG_TABLE_NAME IN ('team_art_posts','team_art_comments','free_board_posts','free_board_comments','posts','comments') THEN '작품 게시판'
    WHEN TG_TABLE_NAME IN ('scenario_character_notes','party_character_notes') THEN '캐릭터 메모'
    WHEN TG_TABLE_NAME IN ('scenario_npcs','scenario_npc_ratings','scenario_npc_comments') THEN '주요 NPC'
    WHEN TG_TABLE_NAME IN ('global_notices','notices') THEN '전체공지'
    WHEN TG_TABLE_NAME IN ('team_log_backups') THEN '팀 로그 백업'
    WHEN TG_TABLE_NAME IN ('player_character_change_requests') THEN '캐릭터 수정 요청'
    WHEN TG_TABLE_NAME IN ('users') THEN '캐릭터 정보'
    WHEN TG_TABLE_NAME IN ('teams') THEN '팀 관리'
    WHEN TG_TABLE_NAME IN ('campaigns') THEN '캠페인 관리'
    WHEN TG_TABLE_NAME IN ('scenarios','scenario_questions','question_choices','progress_stages') THEN '시나리오 관리'
    WHEN TG_TABLE_NAME IN ('images') THEN '토큰 갤러리'
    ELSE '기타 활동'
  END;

  entity_label_value := COALESCE(
    NULLIF(row_data->>'character_name', ''),
    NULLIF(row_data->>'title', ''),
    NULLIF(row_data->>'name', ''),
    NULLIF(row_data->>'file_name', ''),
    NULLIF(row_data->>'username', ''),
    NULLIF(row_data->>'step_number', ''),
    ''
  );

  -- Store the NPC name at the time of the activity, including feedback edits.
  IF TG_TABLE_SCHEMA = 'public'
     AND TG_TABLE_NAME IN ('scenario_npc_ratings', 'scenario_npc_comments') THEN
    feature_value := CASE TG_TABLE_NAME
      WHEN 'scenario_npc_ratings' THEN '주요 NPC 평점'
      ELSE '주요 NPC 댓글'
    END;
    SELECT n.name INTO entity_label_value
    FROM public.scenario_npcs n
    WHERE n.id = NULLIF(row_data->>'npc_id', '')::uuid;
    -- A cascade delete may run after the parent NPC has disappeared.
    entity_label_value := COALESCE(NULLIF(entity_label_value, ''), '삭제된 NPC');
  END IF;

  INSERT INTO public.app_activity_logs
    (actor_user_id, actor_type, actor_label, feature, operation, entity_label, team_id)
  VALUES
    (auth.uid(), actor_type_value, actor_label_value, feature_value, TG_OP,
     left(entity_label_value, 160), team_id_value);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
ALTER FUNCTION public.capture_app_activity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.capture_app_activity() FROM PUBLIC, anon, authenticated;

COMMIT;
