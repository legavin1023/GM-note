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
CREATE INDEX IF NOT EXISTS app_activity_logs_created_idx
  ON public.app_activity_logs(created_at DESC, id DESC);

ALTER TABLE public.app_activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_activity_logs TO authenticated;
DROP POLICY IF EXISTS app_activity_logs_master_read ON public.app_activity_logs;
CREATE POLICY app_activity_logs_master_read ON public.app_activity_logs
  FOR SELECT TO authenticated USING (public.current_user_is_gm());

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

DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'campaigns','teams','users','scenarios','scenario_questions','question_choices',
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
