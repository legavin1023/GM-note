# DragonAge TRPG GM Command Center v2

드래곤에이지 TRPG 캠페인을 관리하기 위한 GM 및 플레이어용 웹 애플리케이션입니다.
GM은 캠페인 전체를 관리하고, 플레이어는 본인 팀의 프로필과 이전 완료 단계의 기록만 확인하고 답변을 편집할 수 있습니다.

---

## 🚀 주요 기능

### 1. 계정 및 권한 (`/login`)

- Supabase Auth를 통한 GM 및 플레이어 로그인.
- 플레이어 계정은 지정된 한 팀에 연결되며, RLS 정책으로 다른 팀 및 비공개 정보를 제한.

### 2. 마스터 대시보드 (`/master`)

- **전체 팀 선택 결과 비교표**: 동일한 시나리오에 대해 각 팀이 어떤 선택(`A`, `B`, `C` 등)을 내렸는지 한눈에 비교.
- **선택 집계 및 막대 그래프**: 질문별 선택 분포(팀 비율)를 시각적으로 확인.
- **팀 진행 현황 및 최근 활동 로그**: 전체 팀의 시나리오 진행률 및 최근 수정 내역 추적.

### 3. 팀 & 캐릭터 관리 (`/teams`, `/characters`)

- **다중 팀 관리**: 팀별 색상, 지역, 진행 단계(STEP), 소속 캐릭터 관리.
- **상세 캐릭터 시트**:
  - 관리 항목: 캐릭터 이름, PL(플레이어) 이름, 토큰 이미지 URL, 레벨, 동기, 목표, 장점, 파멸, 언어, 특징, **건지(Character Quirk)**, 배경, 종족, 클래스, 나이, 키, 몸무게, 사회계층, 소개 글(바이오그래피).
  - **GM 비밀 메모 (`gm_secret`)**: 플레이어 비공개 GM 전용 독립 저장 영역.
  - **토큰 이미지 업로드**: Supabase Storage (`campaign-assets`)에 실시간 업로드 및 자동 URL 매핑.

### 4. 공통 시나리오 및 팀별 플레이 기록 분리 (`/scenarios`, `/scenarios/:id`)

- **데이터 구조의 완벽한 분리**:
  - 시나리오 원본: `scenarios`, `scenario_questions`, `question_choices`
  - 팀별 플레이 기록: `team_scenarios`, `team_scenario_answers`
- **질문별 답변 검증 및 UPSERT**: 질문과 선택지의 관계를 상시 검증하여 잘못된 선택지 입력을 방지하고 1질문-1답변 유지.
- **시나리오 완료 체크 및 GM 메모**: 팀별 시나리오 완료 상태 체크(`completed`) 및 시나리오별 플레이 노트를 작성.

### 5. 시나리오 JSON 관리 & Import/Export (`/admin/scenarios`, `/admin/import`)

- **안정적인 코드 시스템 (`code`)**: `S01`, `Q01`, `A` 등 사람이 관리하기 쉬운 안정적 식별자를 사용해 질문/선택지 문구가 변경되어도 기존 팀 플레이 기록이 보충·유지됨.
- **JSON Import 인스펙터**: 문법 검사, 스키마 검사, 중복 코드 검사를 거쳐 정확한 오류 위치(예: `❌ scenarios[0].questions[1].label 누락`)를 출력하고 안전하게 반영.
- **JSON Export & 전체 백업**: 시나리오 구조를 JSON 파일로 내보내거나, 모든 팀의 캐릭터와 선택 기록을 포함한 전체 백업 파일 지원.

### 6. 팀 토큰 갤러리 (`/gallery`)

- 팀별/공용 자산 분리.
- 이미지 파일 드래그 앤 드롭 업로드 및 외부 URL 등록 지원.
- 썸네일 그리드, 확대 라이트박스 뷰어, 캡션 및 소유자 라벨 지원.

### 7. 통합 검색 & 다크 모드

- 캐릭터 이름, PL 이름, 팀 이름, 시나리오 제목 및 코드를 빠르게 검색하는 통합 검색 기능.
- 세션 중 눈의 피로를 줄이기 위한 다크 모드 지원.

---

## 🛠 기술 스택

| 영역                   | 기술                                           |
| ---------------------- | ---------------------------------------------- |
| **Frontend**           | Vue 3 (Options API), Vue Router 4, Vuex 4      |
| **Backend / Database** | Supabase (Postgres, Auth, Storage, RLS)        |
| **Build & Styling**    | Vue CLI (webpack), Vanilla CSS (CSS Variables) |

---

## 🗄 DB 구조 및 관계

```
Campaigns (1) ─── (N) Teams (1) ─── (N) Users (TRPG 캐릭터 데이터)
    │                  │
    │ (1)              │ (1)
    ▼                  ▼
Scenarios (1)      Team Scenarios (N) ─── (N) Team Scenario Answers
    │
    ├── (N) Scenario Questions
    │            │
    │            └── (N) Question Choices
    │
    └── Images (팀/캐릭터 토큰 갤러리)
```

> 상세 DB 마이그레이션 쿼리는 [`supabase/migration_v2.sql`](./supabase/migration_v2.sql)을 참고하세요.
> 플레이어 계정 연결과 권한 설정은 [`docs/player-access.md`](./docs/player-access.md)를 참고하세요.

---

## 📁 프로젝트 구조

```
dragonage_gm_note_v2/
├── .env                              # Supabase URL & Anon Key
├── package.json
├── vue.config.js
├── docs/
│   └── scenario-json-format.md       # 시나리오 JSON 포맷 작성 문서
├── supabase/
│   ├── migration_v2.sql              # DB 스키마 & RLS 정책 SQL
│   ├── migration_player_access.sql   # 플레이어 계정 및 팀 권한 SQL
│   └── migration_player_account_admin.sql # GM 계정 드롭다운 RPC
├── data/
│   └── scenarios/campaign.json       # 예시 시나리오 JSON
└── src/
    ├── main.js                       # 엔트리 포인트
    ├── App.vue                       # 루트 컴포넌트
    ├── supabase.js                   # Supabase 클라이언트 설정
    ├── router/index.js               # 라우팅 및 GM 인증 가드
    ├── store/index.js                # Vuex 전역 상태 관리
    ├── services/                     # Supabase DB 서비스 레이어
    │   ├── auth.js                   # GM 인증
    │   ├── campaigns.js              # 캠페인 관리
    │   ├── teams.js                  # 팀 관리
    │   ├── characters.js             # 캐릭터 시트 및 토큰 업로드
    │   ├── scenarios.js              # 시나리오 & 플레이 기록 & JSON 백업
    │   └── images.js                 # 갤러리 이미지 관리
    ├── views/                        # 주요 화면 뷰
    │   ├── LoginView.vue             # GM 로그인
    │   ├── DashboardLayout.vue       # 메인 레이아웃 (사이드바, 상단바)
    │   ├── MasterView.vue            # 마스터 대시보드 (선택 비교표 & 통계)
    │   ├── TeamsView.vue             # 팀 목록
    │   ├── TeamDetailView.vue        # 팀 상세 정보
    │   ├── CharactersView.vue        # 전체 캐릭터 목록
    │   ├── CharacterDetailView.vue   # 캐릭터 상세 시트 편집
    │   ├── ScenariosView.vue         # 시나리오 트래커
    │   ├── ScenarioDetailView.vue    # 팀별 선택 입력 & GM 메모
    │   ├── GalleryView.vue           # 토큰 갤러리
    │   ├── AdminScenariosView.vue    # 시나리오 GUI 관리
    │   └── AdminImportView.vue       # 시나리오 JSON Import/검증
    └── components/
        └── common/SearchResults.vue  # 전역 통합 검색
```

---

## ⚙️ 시작하기

### 1. 의존성 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정 (`.env`)

프로젝트 루트 폴더에 `.env` 파일이 존재하는지 확인합니다.

```env
VUE_APP_SUPABASE_URL=https://your-supabase-project.supabase.co
VUE_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. DB 마이그레이션 실행

Supabase 대시보드의 **SQL Editor**에서 [`supabase/migration_v2.sql`](./supabase/migration_v2.sql), [`supabase/migration_player_access.sql`](./supabase/migration_player_access.sql), [`supabase/migration_player_account_admin.sql`](./supabase/migration_player_account_admin.sql)을 순서대로 실행합니다. 플레이어 로그인 Edge Function도 배포해야 합니다. 계정 연결 방법은 [플레이어 권한 설정 문서](./docs/player-access.md)를 참고하세요.

### 4. 개발 서버 실행

```bash
npm run serve
```

브라우저에서 `http://localhost:8080`으로 접속하여 GM 또는 연결된 플레이어 계정으로 로그인합니다.
