-- Server-side audit feed for user-visible changes in the app.
-- Run after the migrations that create the tables listed below.

CREATE TABLE IF NOT EXISTS public.app_activity_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('master', 'player', 'user')),
  actor_label text NOT NULL,
  feature text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_label text NOT NULL DEFAULT '',
  team_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_activity_logs ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS app_activity_logs_created_idx
  ON public.app_activity_logs(created_at DESC, id DESC);

ALTER TABLE public.app_activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_activity_logs TO authenticated;
DROP POLICY IF EXISTS app_activity_logs_master_read ON public.app_activity_logs;
CREATE POLICY app_activity_logs_master_read ON public.app_activity_logs
  FOR SELECT TO authenticated USING (public.current_user_is_gm());

-- Only named application fields are captured; credentials and system metadata are excluded.
CREATE OR REPLACE FUNCTION public.activity_field_label(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE p_key
 WHEN 'name' THEN '이름'
 WHEN 'title' THEN '제목'
 WHEN 'description' THEN '설명'
 WHEN 'content' THEN '내용'
 WHEN 'caption' THEN '설명'
 WHEN 'character_name' THEN '캐릭터 이름'
 WHEN 'player' THEN '플레이어'
 WHEN 'username' THEN '로그인 아이디'
 WHEN 'region' THEN '지역'
 WHEN 'color' THEN '팀 색상'
 WHEN 'progress_step' THEN '진행 시나리오'
 WHEN 'total_steps' THEN '전체 시나리오 수'
 WHEN 'is_frozen' THEN '팀 동결'
 WHEN 'is_active' THEN '계정 활성화'
 WHEN 'level' THEN '레벨'
 WHEN 'age' THEN '나이'
 WHEN 'gender' THEN '성별'
 WHEN 'height' THEN '키'
 WHEN 'weight' THEN '몸무게'
 WHEN 'race' THEN '종족'
 WHEN 'background' THEN '배경'
 WHEN 'social_class' THEN '사회 계층'
 WHEN 'class' THEN '클래스'
 WHEN 'motivation' THEN '동기'
 WHEN 'goal' THEN '목표'
 WHEN 'strengths' THEN '장점'
 WHEN 'doom' THEN '파멸'
 WHEN 'languages' THEN '언어'
 WHEN 'traits' THEN '특징'
 WHEN 'biography' THEN '캐릭터 소개'
 WHEN 'character_quirk' THEN '건지'
 WHEN 'gm_secret' THEN 'GM 비밀 메모'
 WHEN 'player_gm_secret' THEN '플레이어 비밀 메모'
 WHEN 'gm_core_belief' THEN '핵심 신념'
 WHEN 'gm_regret' THEN '후회'
 WHEN 'gm_cherished_person' THEN '소중한 사람'
 WHEN 'gm_desire' THEN '욕망'
 WHEN 'gm_fear' THEN '두려움'
 WHEN 'gm_unknown_secret' THEN '숨겨진 비밀'
 WHEN 'gm_backstory_hooks' THEN '배경 연결'
 WHEN 'token_url' THEN '토큰 이미지'
 WHEN 'avatar_url' THEN '프로필 이미지'
 WHEN 'url' THEN '이미지'
 WHEN 'image_paths' THEN '첨부 이미지'
 WHEN 'image_path' THEN '첨부 이미지'
 WHEN 'file_name' THEN '파일명'
 WHEN 'file_size' THEN '파일 크기'
 WHEN 'storage_path' THEN '첨부 파일'
 WHEN 'owner_label' THEN '소유자'
 WHEN 'step_number' THEN '시나리오 번호'
 WHEN 'scenario_step' THEN 'NPC 등장 시나리오'
 WHEN 'code' THEN '시나리오 코드'
 WHEN 'prompt' THEN '질문'
 WHEN 'label' THEN '선택지'
 WHEN 'text' THEN '선택지 내용'
 WHEN 'answer' THEN '답변'
 WHEN 'answer_text' THEN '답변 내용'
 WHEN 'notes' THEN '메모'
 WHEN 'gm_note' THEN 'GM 메모'
 WHEN 'completed' THEN '완료 여부'
 WHEN 'is_completed' THEN '완료 여부'
 WHEN 'status' THEN '상태'
 WHEN 'rating' THEN '평점'
 WHEN 'is_spoiler' THEN '스포일러 표시'
 WHEN 'is_public' THEN '공개 여부'
 WHEN 'show_author' THEN '작성자 공개'
 WHEN 'visibility' THEN '공개 범위'
 WHEN 'note_date' THEN '기록 날짜'
 WHEN 'sort_order' THEN '표시 순서'
 WHEN 'starts_at' THEN '세션 시작'
 WHEN 'cancelled' THEN '세션 취소'
 WHEN 'team_id' THEN '소속 팀'
 WHEN 'scenario_id' THEN '연결 시나리오'
 WHEN 'question_id' THEN '질문'
 WHEN 'choice_id' THEN '선택지'
 WHEN 'character_id' THEN '캐릭터'
 WHEN 'target_character_id' THEN '대상 캐릭터'
 WHEN 'requested_changes' THEN '수정 요청 내용'
 WHEN 'changes' THEN '수정 요청 내용'
 WHEN 'reason' THEN '사유'
 WHEN 'rejection_reason' THEN '반려 사유'
 ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.activity_value(p_key text, p_value jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result text; ref_table text;
BEGIN
 IF p_value IS NULL OR p_value = 'null'::jsonb OR p_value = '""'::jsonb THEN RETURN '없음'; END IF;
 IF p_key LIKE 'gm_%' OR p_key = 'player_gm_secret' THEN RETURN '비공개 내용'; END IF;
 IF p_key IN ('requested_changes','changes') THEN
   IF jsonb_typeof(p_value) <> 'object' THEN RETURN '수정 요청 내용'; END IF;
   SELECT string_agg(public.activity_field_label(key) || ': ' || public.activity_value(key,value), ', ' ORDER BY key) INTO result
   FROM jsonb_each(p_value) WHERE public.activity_field_label(key) IS NOT NULL;
   RETURN COALESCE(result, '수정 요청 내용');
 END IF;
 IF p_key IN ('token_url','avatar_url','url','image_path','storage_path') THEN RETURN '첨부됨'; END IF;
 IF p_key = 'image_paths' AND jsonb_typeof(p_value) = 'array' THEN RETURN jsonb_array_length(p_value)::text || '개'; END IF;
 IF p_key = 'status' THEN
   RETURN CASE p_value #>> '{}' WHEN 'pending' THEN '검토 대기' WHEN 'approved' THEN '승인' WHEN 'rejected' THEN '반려' ELSE p_value #>> '{}' END;
 END IF;
 IF jsonb_typeof(p_value) = 'boolean' THEN RETURN CASE WHEN p_value = 'true'::jsonb THEN '예' ELSE '아니오' END; END IF;
 ref_table := CASE p_key WHEN 'team_id' THEN 'teams' WHEN 'scenario_id' THEN 'scenarios'
   WHEN 'question_id' THEN 'scenario_questions' WHEN 'choice_id' THEN 'question_choices'
   WHEN 'character_id' THEN 'users' WHEN 'target_character_id' THEN 'users' ELSE NULL END;
 IF ref_table IS NOT NULL AND to_regclass('public.' || ref_table) IS NOT NULL THEN
   EXECUTE format('SELECT COALESCE(to_jsonb(r)->>''character_name'', to_jsonb(r)->>''title'', to_jsonb(r)->>''name'', to_jsonb(r)->>''prompt'', to_jsonb(r)->>''label'', to_jsonb(r)->>''text'') FROM public.%I r WHERE id::text = $1', ref_table)
   INTO result USING p_value #>> '{}';
   RETURN left(COALESCE(result, '연결 대상'), 240);
 END IF;
 RETURN left(p_value #>> '{}', 240);
END;
$$;
ALTER FUNCTION public.activity_value(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activity_value(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activity_field_label(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.capture_app_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  row_data jsonb;
  old_data jsonb := '{}'::jsonb;
  detail_rows jsonb := '[]'::jsonb;
  field record;
  parent_data jsonb;
  parent_table text;
  context_label text;
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
    WHEN TG_TABLE_NAME = 'campaigns' THEN '캠페인'
    WHEN TG_TABLE_NAME = 'teams' THEN '팀 정보'
    WHEN TG_TABLE_NAME = 'users' THEN '캐릭터 정보'
    WHEN TG_TABLE_NAME = 'scenarios' THEN '시나리오'
    WHEN TG_TABLE_NAME = 'progress_stages' THEN '시나리오 진행 단계'
    WHEN TG_TABLE_NAME = 'scenario_questions' THEN '시나리오 질문'
    WHEN TG_TABLE_NAME = 'question_choices' THEN '시나리오 선택지'
    WHEN TG_TABLE_NAME = 'team_scenarios' THEN '팀 시나리오 진행'
    WHEN TG_TABLE_NAME = 'team_scenario_answers' THEN '팀 시나리오 답변'
    WHEN TG_TABLE_NAME = 'team_scenario_gm_notes' THEN '팀 시나리오 GM 메모'
    WHEN TG_TABLE_NAME = 'team_art_posts' THEN '작품 게시글'
    WHEN TG_TABLE_NAME = 'team_art_comments' THEN '작품 댓글'
    WHEN TG_TABLE_NAME = 'free_board_posts' THEN '자유 게시글'
    WHEN TG_TABLE_NAME = 'free_board_comments' THEN '자유 게시글 댓글'
    WHEN TG_TABLE_NAME = 'posts' THEN '게시글'
    WHEN TG_TABLE_NAME = 'comments' THEN '게시글 댓글'
    WHEN TG_TABLE_NAME = 'scenario_character_notes' THEN '시나리오 캐릭터 메모'
    WHEN TG_TABLE_NAME = 'party_character_notes' THEN '파티 캐릭터 메모'
    WHEN TG_TABLE_NAME = 'scenario_npcs' THEN '주요 NPC'
    WHEN TG_TABLE_NAME = 'scenario_npc_ratings' THEN '주요 NPC 평점'
    WHEN TG_TABLE_NAME = 'scenario_npc_comments' THEN '주요 NPC 댓글'
    WHEN TG_TABLE_NAME = 'notices' THEN '공지'
    WHEN TG_TABLE_NAME = 'global_notices' THEN '전체공지'
    WHEN TG_TABLE_NAME = 'team_log_backups' THEN '팀 로그 백업'
    WHEN TG_TABLE_NAME = 'player_character_change_requests' THEN '캐릭터 수정 요청'
    WHEN TG_TABLE_NAME = 'images' THEN '토큰 갤러리'
    WHEN TG_TABLE_NAME = 'team_sessions' THEN '팀 세션 일정'
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

  -- Snapshot parent context so later renames/deletions do not change the history.
  IF TG_TABLE_NAME = 'teams' THEN team_id_value := NULLIF(row_data->>'id','')::uuid; END IF;
  parent_table := CASE
    WHEN row_data ? 'post_id' THEN CASE TG_TABLE_NAME
      WHEN 'team_art_comments' THEN 'team_art_posts' WHEN 'free_board_comments' THEN 'free_board_posts' ELSE 'posts' END
    WHEN row_data ? 'team_scenario_id' THEN 'team_scenarios' ELSE NULL END;
  IF parent_table IS NOT NULL AND to_regclass('public.' || parent_table) IS NOT NULL THEN
    EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id::text = $1',parent_table)
    INTO parent_data USING COALESCE(row_data->>'post_id',row_data->>'team_scenario_id');
    team_id_value := COALESCE(team_id_value,NULLIF(parent_data->>'team_id','')::uuid);
    context_label := COALESCE(NULLIF(parent_data->>'title',''),NULLIF(parent_data->>'content',''));
  END IF;
  entity_label_value := COALESCE(NULLIF(row_data->>'target_character_name',''),NULLIF(entity_label_value,''),
    NULLIF(row_data->>'caption',''),NULLIF(row_data->>'prompt',''),NULLIF(row_data->>'label',''),
    NULLIF(context_label,''),NULLIF(row_data->>'content',''),feature_value);
  IF row_data ? 'character_id' THEN
    entity_label_value := public.activity_value('character_id',row_data->'character_id');
  END IF;
  IF COALESCE(row_data->>'scenario_id',parent_data->>'scenario_id') IS NOT NULL THEN
    entity_label_value := entity_label_value || ' · ' || public.activity_value('scenario_id',
      COALESCE(row_data->'scenario_id',parent_data->'scenario_id'));
  ELSIF COALESCE(row_data->>'step_number',parent_data->>'step_number',row_data->>'scenario_step') IS NOT NULL THEN
    entity_label_value := entity_label_value || ' · 시나리오 ' ||
      COALESCE(row_data->>'step_number',parent_data->>'step_number',row_data->>'scenario_step');
  END IF;
  IF team_id_value IS NOT NULL THEN
    entity_label_value := entity_label_value || ' · ' || CASE WHEN TG_TABLE_NAME = 'teams'
      THEN COALESCE(row_data->>'name','팀') ELSE public.activity_value('team_id',to_jsonb(team_id_value)) END;
  END IF;
  IF TG_TABLE_SCHEMA = 'storage' THEN entity_label_value := COALESCE(row_data->>'name','첨부 파일'); END IF;
  IF TG_OP = 'UPDATE' THEN old_data := to_jsonb(OLD); END IF;
  FOR field IN SELECT key,value FROM jsonb_each(row_data) ORDER BY key LOOP
    IF public.activity_field_label(field.key) IS NULL THEN CONTINUE; END IF;
    IF TG_OP = 'UPDATE' AND old_data->field.key IS NOT DISTINCT FROM field.value THEN CONTINUE; END IF;
    IF TG_OP <> 'UPDATE' AND (field.value = 'null'::jsonb OR field.value = '""'::jsonb OR field.value = '[]'::jsonb) THEN CONTINUE; END IF;
    detail_rows := detail_rows || jsonb_build_array(jsonb_build_object(
      'field',field.key,'label',CASE WHEN field.key = 'is_active' AND TG_TABLE_NAME <> 'users' THEN '활성화 여부' ELSE public.activity_field_label(field.key) END,
      'before',CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN public.activity_value(field.key,CASE WHEN TG_OP = 'DELETE' THEN field.value ELSE old_data->field.key END) END,
      'after',CASE WHEN TG_OP <> 'DELETE' THEN public.activity_value(field.key,field.value) END));
  END LOOP;
  -- Ignore timestamp-only updates; they do not represent an application edit.
  IF TG_OP = 'UPDATE' AND detail_rows = '[]'::jsonb THEN RETURN NEW; END IF;

  INSERT INTO public.app_activity_logs
    (actor_user_id, actor_type, actor_label, feature, operation, entity_label, team_id, details)
  VALUES
    (auth.uid(), actor_type_value, actor_label_value, feature_value, TG_OP,
     left(entity_label_value, 160), team_id_value, detail_rows);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
ALTER FUNCTION public.capture_app_activity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.capture_app_activity() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'team_sessions','campaigns','teams','users','scenarios','scenario_questions','question_choices',
    'progress_stages','team_scenarios','team_scenario_answers','team_scenario_gm_notes',
    'player_character_change_requests','images','notices','global_notices',
    'posts','comments','free_board_posts','free_board_comments','team_art_posts','team_art_comments',
    'team_log_backups','scenario_npcs','scenario_npc_ratings','scenario_npc_comments',
    'scenario_character_notes','party_character_notes'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF pg_catalog.to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'DROP TRIGGER IF EXISTS app_activity_audit ON public.%I', table_name
      );
      EXECUTE pg_catalog.format(
        'CREATE TRIGGER app_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_app_activity()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF pg_catalog.to_regclass('storage.objects') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS app_activity_audit ON storage.objects;
    CREATE TRIGGER app_activity_audit
      AFTER INSERT OR UPDATE OR DELETE ON storage.objects
      FOR EACH ROW EXECUTE FUNCTION public.capture_app_activity();
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'app_activity_logs'
  ) THEN
    NULL;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_activity_logs;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
