-- ============================================================
-- DragonAge GM Note v2 — DB 마이그레이션
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- 기존 데이터는 보호됩니다 (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ─────────────────────────────────────────
-- 1. users 테이블에 character_quirk (건지) 필드 추가
-- ─────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS character_quirk text;

-- ─────────────────────────────────────────
-- 2. scenarios 테이블에 is_active 필드 추가
--    (JSON에서 삭제된 시나리오도 기록 보호를 위해 삭제하지 않고 비활성화)
-- ─────────────────────────────────────────
ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ─────────────────────────────────────────
-- 3. scenario_questions 테이블에 code, is_active 필드 추가
--    code = "Q01", "Q02" 등 사람이 읽기 쉬운 식별자
-- ─────────────────────────────────────────
ALTER TABLE public.scenario_questions
  ADD COLUMN IF NOT EXISTS code text;

ALTER TABLE public.scenario_questions
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- scenarios.code UNIQUE 제약 (campaign_id + code 조합)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'scenarios_campaign_id_code_key'
      AND table_name = 'scenarios'
  ) THEN
    ALTER TABLE public.scenarios
      ADD CONSTRAINT scenarios_campaign_id_code_key UNIQUE (campaign_id, code);
  END IF;
END$$;

-- scenario_questions.code UNIQUE 제약
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'scenario_questions_scenario_id_code_key'
      AND table_name = 'scenario_questions'
  ) THEN
    ALTER TABLE public.scenario_questions
      ADD CONSTRAINT scenario_questions_scenario_id_code_key UNIQUE (scenario_id, code);
  END IF;
END$$;

-- ─────────────────────────────────────────
-- 4. question_choices 테이블에 code 필드 추가
--    code = "A", "B", "C" 등
-- ─────────────────────────────────────────
ALTER TABLE public.question_choices
  ADD COLUMN IF NOT EXISTS code text;

-- question_choices.code UNIQUE 제약
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'question_choices_question_id_code_key'
      AND table_name = 'question_choices'
  ) THEN
    ALTER TABLE public.question_choices
      ADD CONSTRAINT question_choices_question_id_code_key UNIQUE (question_id, code);
  END IF;
END$$;

-- ─────────────────────────────────────────
-- 5. team_scenarios — scenario_id FK 추가 (기존 step_number 방식 병행)
--    새 버전에서는 scenario_id로 관리
-- ─────────────────────────────────────────
ALTER TABLE public.team_scenarios
  ADD COLUMN IF NOT EXISTS scenario_id uuid;

-- scenario_id FK 제약
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_scenarios_scenario_id_fkey'
      AND table_name = 'team_scenarios'
  ) THEN
    ALTER TABLE public.team_scenarios
      ADD CONSTRAINT team_scenarios_scenario_id_fkey
      FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id);
  END IF;
END$$;

-- team_id + scenario_id UNIQUE 제약
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_scenarios_team_id_scenario_id_key'
      AND table_name = 'team_scenarios'
  ) THEN
    ALTER TABLE public.team_scenarios
      ADD CONSTRAINT team_scenarios_team_id_scenario_id_key UNIQUE (team_id, scenario_id);
  END IF;
END$$;

-- ─────────────────────────────────────────
-- 6. team_scenario_answers — question_id + team_scenario_id UNIQUE
--    같은 질문에 중복 답변이 쌓이지 않게
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_scenario_answers_team_scenario_id_question_id_key'
      AND table_name = 'team_scenario_answers'
  ) THEN
    ALTER TABLE public.team_scenario_answers
      ADD CONSTRAINT team_scenario_answers_team_scenario_id_question_id_key
      UNIQUE (team_scenario_id, question_id);
  END IF;
END$$;

-- ─────────────────────────────────────────
-- 7. RLS 정책 설정
--    GM(auth.uid())이 소유한 캠페인 기준으로 모든 테이블 접근 제한
-- ─────────────────────────────────────────

-- campaigns: 소유자만 접근
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_owner_all" ON public.campaigns;
CREATE POLICY "campaigns_owner_all" ON public.campaigns
  FOR ALL USING (owner_id = auth.uid());

-- teams: 소유자의 캠페인에 속한 팀만
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_owner_all" ON public.teams;
CREATE POLICY "teams_owner_all" ON public.teams
  FOR ALL USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
  );

-- users(캐릭터): 소유자의 캠페인 팀에 속한 캐릭터만
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_owner_all" ON public.users;
CREATE POLICY "users_owner_all" ON public.users
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- scenarios: 소유자의 캠페인 시나리오만
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scenarios_owner_all" ON public.scenarios;
CREATE POLICY "scenarios_owner_all" ON public.scenarios
  FOR ALL USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
  );

-- scenario_questions: 소유자의 시나리오에 속한 질문만
ALTER TABLE public.scenario_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scenario_questions_owner_all" ON public.scenario_questions;
CREATE POLICY "scenario_questions_owner_all" ON public.scenario_questions
  FOR ALL USING (
    scenario_id IN (
      SELECT s.id FROM public.scenarios s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- question_choices: 소유자의 질문에 속한 선택지만
ALTER TABLE public.question_choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_choices_owner_all" ON public.question_choices;
CREATE POLICY "question_choices_owner_all" ON public.question_choices
  FOR ALL USING (
    question_id IN (
      SELECT q.id FROM public.scenario_questions q
      JOIN public.scenarios s ON s.id = q.scenario_id
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- team_scenarios: 소유자의 팀에 속한 기록만
ALTER TABLE public.team_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_scenarios_owner_all" ON public.team_scenarios;
CREATE POLICY "team_scenarios_owner_all" ON public.team_scenarios
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- team_scenario_answers: 소유자의 team_scenarios에 속한 답변만
ALTER TABLE public.team_scenario_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_scenario_answers_owner_all" ON public.team_scenario_answers;
CREATE POLICY "team_scenario_answers_owner_all" ON public.team_scenario_answers
  FOR ALL USING (
    team_scenario_id IN (
      SELECT ts.id FROM public.team_scenarios ts
      JOIN public.teams t ON t.id = ts.team_id
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- images: 소유자의 캠페인 이미지만
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "images_owner_all" ON public.images;
CREATE POLICY "images_owner_all" ON public.images
  FOR ALL USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT t.id FROM public.teams t
      JOIN public.campaigns c ON c.id = t.campaign_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- progress_stages: 전체 읽기 허용 (로그인 사용자)
ALTER TABLE public.progress_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progress_stages_auth_read" ON public.progress_stages;
CREATE POLICY "progress_stages_auth_read" ON public.progress_stages
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- 8. Supabase Storage 버킷 생성
--    SQL에서 직접 생성 (storage.buckets에 insert)
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-assets', 'campaign-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- 완료 확인용 쿼리
-- ─────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'users' AND column_name = 'character_quirk';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'scenario_questions' AND column_name = 'code';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'question_choices' AND column_name = 'code';
