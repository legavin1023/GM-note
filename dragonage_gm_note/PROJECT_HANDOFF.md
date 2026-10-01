# DragonAge GM Note — 프로젝트 설명 문서 (AI 인수인계용)

이 문서는 "드래곤에이지 TRPG 캠페인 GM 대시보드" 프로젝트의 현재 상태를 다른 AI/개발자에게
설명하기 위해 작성되었습니다. 아래 내용을 읽으면 추가 탐색 없이 코드베이스 구조,
데이터 흐름, 완료된 기능, 알려진 이슈를 파악할 수 있습니다.

---

## 1. 프로젝트 개요

- **목적**: 드래곤에이지 TRPG 캠페인에서 GM(게임마스터)이 여러 팀(파티)의 진행 상황,
  캐릭터 시트, 시나리오 분기 선택, 이미지 자료를 한 곳에서 관리하는 웹 대시보드.
- **사용자**: GM 1인 로그인 (Supabase Auth 이메일/비밀번호). 플레이어용 화면은 없음 (전부 GM 전용).
- **핵심 특징**:
  - 다중 팀(초기 6팀) × 공통 시나리오 목록 구조
  - 시나리오 진행 여부/분기 선택/GM 메모는 **팀별로 독립적**으로 저장
  - 캐릭터 시트(레벨/종족/클래스/배경 등 상세 필드) 관리
  - 이미지 갤러리(팀/캐릭터별 업로드 + 그리드 뷰)
  - 마스터 대시보드(전체 팀 비교 보드) + 진행도 프로그레스 바
  - JSON Import/Export(백업/복구)
  - 다크 모드 + 반응형(태블릿 대응)

---

## 2. 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Vue 3, **Options API** (Composition API 아님) |
| 상태 관리 | Vuex 4 (`src/store/index.js`) — 얕은 캐시 역할, 실제 화면은 대부분 컴포넌트 로컬 `data()` 사용 |
| 라우팅 | vue-router 4, hash history (`/`, `/about`) |
| 백엔드 | **Supabase** (Postgres + Auth + Storage) |
| 빌드 | Vue CLI (`vue.config.js`, webpack) |
| 린트 | ESLint (`.eslintrc.js`) — `npm run lint` |

주요 명령 (모두 `dragonage_gm_note/` 폴더에서 실행):
```powershell
npm run serve   # 개발 서버
npm run lint    # 린트 (자동 수정 포함)
npm run build   # 프로덕션 빌드 (정적 오류 검증용)
```

---

## 3. 폴더 구조

```
dragonage_gm_note/
├── .env                        # VUE_APP_SUPABASE_URL, VUE_APP_SUPABASE_ANON_KEY
├── src/
│   ├── main.js
│   ├── App.vue                 # <router-view /> 만 있음 (거의 빈 쉘)
│   ├── supabase.js             # createClient() 초기화, .env 없으면 null 반환
│   ├── router/index.js         # "/" -> HomeView, "/about" -> AboutView
│   ├── store/index.js          # Vuex: user, currentCampaign, teams, scenarios
│   ├── services/
│   │   └── db.js               # ★ Supabase 통신 전담 (아래 4장 참고)
│   ├── data/
│   │   └── campaign.schema.json  # (레거시) 순수 JSON 방식 캠페인 스키마 정의. 참고용.
│   ├── components/              # (거의 사용 안 함, 로직 대부분 HomeView.vue에 집중)
│   └── views/
│       ├── HomeView.vue         # ★★★ 메인 대시보드. 전체 UI/로직의 90% 이상 위치
│       └── AboutView.vue
├── supabase/
│   └── schema.sql               # ★ DB 스키마 정의 (초안, 100% 최신은 아닐 수 있음 — 5장 참고)
├── package.json
└── vue.config.js
```

### 왜 `HomeView.vue` 하나에 로직이 몰려 있는가
초기에 순수 JSON 로컬 상태(campaign 객체 하나)로 빠르게 프로토타이핑한 뒤,
점진적으로 Supabase 연동으로 전환하는 방식으로 개발되어 왔습니다. 그 결과
`campaign` (로컬 캐시 객체) ↔ Supabase 테이블 간의 매핑/동기화 코드가
`HomeView.vue` 안에 거의 다 들어 있습니다 (컴포넌트 분리는 아직 안 되어 있음).

---

## 4. 데이터베이스 (Supabase) 구조

### 4-1. 실제로 사용 중인 핵심 테이블 (프론트가 참조하는 테이블명 기준)

> ⚠️ **중요**: `supabase/schema.sql`은 "초안"이며, 실제 운영 중인 DB는 대화 중 사용자가
> 직접 만든 `users`, `progress_stages` 테이블을 쓰도록 재구성되었습니다.
> 아래 표는 **현재 프론트엔드 코드(`db.js`, `HomeView.vue`)가 실제로 호출하는 테이블/컬럼**
> 기준으로 정리한 것이며, `schema.sql`의 `characters`/`scenarios` 테이블과는 이름이 다릅니다.

| 테이블 | 역할 | 주요 컬럼 |
|---|---|---|
| `campaigns` | 캠페인(=GM 1명 소유) | `id`, `owner_id`(auth.uid FK), `title`, `version` |
| `teams` | 팀(파티) | `id`, `campaign_id`, `name`, `region`, `color`, `description`, `sort_order` |
| `users` | **캐릭터 시트** (테이블명은 `users`이지만 실제로는 "캐릭터" 역할) | `id`, `team_id`(FK→teams), `username`, `player`, `token_url`, `level`, `age`, `height`, `weight`, `race`, `background`, `social_class`, `class`, `motivation`, `goal`, `strengths`, `doom`, `languages`, `traits`, `biography`, `gm_secret`, `player_gm_secret` |
| `scenarios` | 시나리오 마스터(제목/설명) — `scenario_questions`, `question_choices`와 함께 조회 | `id`, `campaign_id`, `code`, `title`, `description`, `sort_order` |
| `scenario_questions` | 시나리오 내 "분기(질문)" | `id`, `scenario_id`, `prompt`, `sort_order` |
| `question_choices` | 분기별 선택지 | `id`, `question_id`, `label`, `sort_order` |
| `progress_stages` | **시나리오 진행 단계 목록** (좌측 사이드바에 노출되는 실제 트래커 목록). `step_number`로 정렬. `scenario_questions`를 함께 embed 조회 | `id`, `step_number`, (제목/설명 컬럼 등, 정확한 전체 컬럼은 미확인) |
| `team_scenarios` | 팀별 시나리오 진행 상태 | `id`, `team_id`, `step_number`(progress_stages와 매칭), `completed`, `gm_note` |
| `team_scenario_answers` | 팀별 분기 선택 기록 | `team_scenario_id`, `question_id`, `choice_id` |
| `images` | 갤러리 이미지 메타 | `id`, `campaign_id`, `team_id`(nullable), `character_id`(nullable), `url`, `caption`, `owner_label` |

### 4-2. 테이블 관계 요약
```
campaigns 1─* teams 1─* users(캐릭터)
campaigns 1─* scenarios 1─* scenario_questions 1─* question_choices
progress_stages 1─* scenario_questions   (progress_stages가 "시나리오 진행 단계" 트래커의 실체)
teams 1─* team_scenarios(step_number 기준) 1─* team_scenario_answers
teams/users(캐릭터) 1─* images (갤러리)
```

### 4-3. `progress_stages` vs `scenarios` 관계 (★ 헷갈리기 쉬운 부분)
- 개발 초반에는 `scenarios` 테이블이 "시나리오 트래커 목록"의 원본이었습니다.
- 사용자의 요청("progress_stages 테이블이 시나리오 테이블이어야해")에 따라
  **현재는 `progress_stages`가 좌측 사이드바에 표시되는 진짜 "시나리오 진행 단계" 목록**이며,
  팀별 진행 상태(`team_scenarios`)도 `scenario_id`가 아니라 **`step_number`**로 매칭됩니다.
- `scenarios`/`scenario_questions`/`question_choices` 테이블은 여전히 존재하고
  "분기/선택지 편집" 기능에 사용되지만, **최상위 트래커 목록의 소스는 `progress_stages`**입니다.
- 이 이원화 때문에 과거 여러 차례 "시나리오 목록이 안 뜬다"는 버그가 있었고,
  현재는 `db.js`의 `getProgressStages()` (progress_stages를 step_number asc로 조회,
  `scenario_questions(*, question_choices(*))`를 embed) 결과를 `HomeView.vue`의
  `progressStages` state에 저장 → 좌측 사이드바 렌더링에 사용합니다.

### 4-4. RLS(Row Level Security)
`schema.sql`에는 `owner_id = auth.uid()` / `user_owns_campaign()` 함수 기반의
소유자 전용 정책이 정의되어 있습니다. `users`, `progress_stages` 테이블은
스키마 파일에 없으므로 (사용자가 직접 만든 테이블) **RLS 정책이 적용되어 있는지,
GM 계정에 insert/update/delete 권한이 있는지는 미확인** 상태입니다.
저장/삭제 시 permission denied 에러가 나면 이 부분을 먼저 점검해야 합니다.

---

## 5. `src/services/db.js` — Supabase 통신 함수 목록

```js
getCampaigns(ownerId)                 // campaigns 조회 (owner_id 필터)
getCampaignDetails(campaignId)        // teams(+team_scenarios+answers), scenarios(+questions+choices) 병렬 조회
getProgressStages()                   // progress_stages 전체 (step_number asc), scenario_questions embed
getTeamsWithUsers(campaignId)         // teams.select("*, users(*)") — 팀+캐릭터 한 번에
saveScenario(scenario)                // scenarios upsert
saveTeamScenario(teamId, stepNumber, completed, gmNote)
                                       // team_scenarios upsert (onConflict: team_id,step_number)
saveUser(character)                   // users upsert — USER_SAVE_FIELDS 화이트리스트로 payload 구성
deleteUser(userId)                    // users delete by id
uploadImage(file, path)               // Supabase Storage 'post-images' 버킷 업로드 + public URL 반환
signIn(email, password) / signOut()   // Auth
```

`USER_SAVE_FIELDS` 화이트리스트:
```
id, team_id, username, player, token_url, level, age, height, weight,
race, background, social_class, class, motivation, goal, strengths,
doom, languages, traits, biography, gm_secret, player_gm_secret
```

---

## 6. `HomeView.vue` — 화면/기능 구조

### 6-1. 인증 & 초기 로딩 흐름
1. `mounted()` → `supabase.auth.getSession()` 확인 → `applySession(session)`
2. `applySession`: `this.user` 세팅, 로그인 상태면 `loadCampaigns()` 호출
3. `loadCampaigns()`:
   - `getCampaigns(user.id)`로 캠페인 목록 조회 → 첫 번째 캠페인 사용
   - `Promise.allSettled`로 3개 병렬 조회: `getCampaignDetails`, `getProgressStages`, `getTeamsWithUsers`
   - 팀 데이터에 `users`(캐릭터) 배열 merge, `team.characters = team.users`로 동기화
   - `team.scenarios[step_number] = { completed, gmNote, answers }` 형태로 팀별 진행 상태 맵 구성
   - `this.progressStages`, `this.campaign.teams`, `this.campaign.scenarios`에 저장
   - 캠페인이 없으면 `"캠페인이 없습니다. campaigns.owner_id가 로그인 사용자(...)와 같은지 확인하세요."` 에러 표시
4. 로그인 안 된 상태에서는 로그인 폼, 로딩 중에는 로딩 패널이 표시되고,
   `dashboardReady === true`가 되어야 실제 대시보드(`app-shell`)가 렌더링됨

### 6-2. 좌측 사이드바 4개 메뉴 (`activeView` 상태로 전환)
| activeView 값 | 화면 |
|---|---|
| `overview` | 전체 현황 (마스터 대시보드) |
| `scenarios` | 시나리오 트래커 |
| `teams` / `team-detail` | 팀 & 캐릭터 (팀 목록 → 팀 클릭 시 상세) |
| `gallery` | 이미지 갤러리 |

### 6-3. 전체 현황 (마스터 대시보드) — `overview`
- 모든 팀 × 모든 시나리오 진행 상태를 한 번에 비교하는 보드/테이블
- 팀별 프로그레스 바 (`progress(team)` computed 계산: 완료 시나리오 수 / 전체 시나리오 수)
- `completedCount(team)`, `currentScenario(team)` 등 팀별 요약 통계

### 6-4. 시나리오 트래커 — `scenarios`
- 좌측: `progressStages` 배열을 `v-for`로 렌더링 (서버에서 불러온 진짜 목록, 버튼으로 임시 생성하는 방식 제거됨)
- 특정 항목 클릭 → `selectedScenario`로 설정 (`selectScenario(scenario)`)
- 우측: 선택된 시나리오의 질문(`scenario_questions`)과 선택지(`question_choices`) 목록
  - 질문/선택지는 시나리오마다 개수가 다르며 추가/삭제 가능 (`addQuestion`, `deleteQuestion`, `addChoice`, `deleteChoice`)
- 팀 선택 드롭다운/탭으로 "어느 팀 기준으로 보고 있는지" 전환 가능
  - `teamScenario(team, scenario)`: 해당 팀의 완료 여부/GM메모/답변 레코드 반환
  - `scenarioState`, `scenarioStepClass`: 완료/진행중/미시작 등 상태 클래스
  - `choiceLabel`, `choiceClass`: 라디오/체크박스로 선택된 분기를 팀별로 독립 저장
  - 각 시나리오마다 **GM 메모** textarea 필수 입력란 존재 (`gmNote`)

### 6-5. 팀 & 캐릭터 — `teams` / `team-detail`
- 팀 목록 카드: 이름, 지역, 색상, 캐릭터 수, 진행도 프로그레스 바
- '팀 추가'(`addTeam`) / '팀 삭제'(`deleteTeam`) 버튼
- 팀 클릭 → `selectTeam(team)` → `selectedTeam` 설정 → `team-detail` 화면
  - 해당 팀이 각 시나리오에서 무엇을 선택했는지 + 진행도를 볼 수 있는 상세 보드 포함
  - 팀 소속 캐릭터 그리드: `selectedTeam.users`를 `v-for`로 순회
    - 카드에 `token_url`(토큰 이미지), `level`, `class`, `formattedCharacterName()` 표시
  - '캐릭터 추가'(`addCharacter`) 버튼 → `crypto.randomUUID()`로 id 생성, `team_id` 세팅
  - 캐릭터 카드 클릭 → **캐릭터 시트(상세 편집 폼)** 오픈
    - 메타: 이름(`username`), PL(`player`), 토큰 URL(`token_url`)
    - 기본 정보: 레벨, 나이, 키, 몸무게, 종족(race), 배경(background), 사회계층(social_class), 클래스(class)
    - 세부 설정 textarea 7종: 동기/목표/장점/파멸/언어/특징/전기 (`characterFields` 배열 기반 동적 렌더링)
    - 메모장: GM 비밀 메모(`gm_secret`), 플레이어+GM 공유 메모(`player_gm_secret`)
    - **"Supabase에 저장" 버튼** → `saveCharacter()` → `saveUser()` 호출, 저장 상태 표시(저장됨/저장 실패)
    - 캐릭터 삭제(`deleteCharacter`) → 로컬 제거 + `deleteUser()`로 DB에서도 삭제
- `formattedCharacterName(character)`: `parseUsername()`을 이용해 `"카르토펠 (PL: 두호)"` 형태로 표시
- `characterInitial(character)`: 아바타 fallback 글자
- `parseUsername(username)`: 원본 `username` 문자열을 캐릭터명/PL명으로 분리하는 파서 (구체 포맷 규칙은 코드 참고)

### 6-6. 이미지 갤러리 — `gallery`
- `campaign.gallery` 배열 기반 그리드 뷰 (`gallery-grid`)
- 필터: `galleryFilter` (전체/팀별/공용 등)
- 업로드: `uploadGalleryImage(event)` → `uploadImage()`(Storage) 호출 → URL을 캐릭터/팀에 연결
- 삭제: `deleteGalleryImage(image)`
- `teamImages(team)`, `galleryImages`, `filteredGallery` computed로 필터링

### 6-7. 데이터 Import/Export (JSON 백업)
- `exportData()` / `downloadCampaignJson()`: 현재 `campaign` 객체 전체를 JSON 파일로 다운로드
- `triggerImport()` / `importData(event)`: JSON 파일 업로드 → `normalizeCampaign()`으로 구조 검증/보정 후 적용
- `saveCampaignToDatabase()` / `loadCampaignFromDatabase()`: (로컬 브라우저 저장소 또는 DB 저장용 헬퍼, 사이드바의 "저장" 버튼과 연동)

### 6-8. UI/UX
- `darkMode` boolean state, 사이드바에서 토글 가능 (watch로 body class 등에 반영)
- 반응형 CSS (태블릿 대응) — `HomeView.vue` `<style>` 섹션에 미디어쿼리 포함

---

## 7. 지금까지 진행된 주요 변경 이력 (시간 순 요약)

1. **초기 버전**: 순수 로컬 JSON(`campaign` 객체, Vuex 없이) 기반 프로토타입 — 팀/시나리오/캐릭터/갤러리 UI 최초 구현
2. **수정/삭제 기능 추가**: 팀/캐릭터/질문/선택지 CRUD 버튼 전반 추가
3. **분기(질문) 가변 개수 지원**: 시나리오마다 질문 개수가 다르고 추가/삭제 가능하도록 구조 변경, 팀 클릭 시 해당 팀의 시나리오별 선택/진행도를 보는 상세 보드 추가
4. **Supabase 연동 시작**: `supabase.js`, 로그인 폼, `campaigns`/`teams`/`scenarios` 테이블 연동, RLS 정책, `owner_id` 이슈 트러블슈팅
5. **시나리오 데이터 모델 리팩터링**: `scenarios` 테이블 대신 **`progress_stages`**를 트래커의 원천으로 전환
   (`step_number` 기준으로 `team_scenarios`, `scenario_questions` 매칭 변경). 이 과정에서
   "시나리오 목록이 안 뜬다", "분기 선택 기능이 사라졌다" 등 여러 회귀 버그가 있었고 반복 수정됨.
6. **팀별 캐릭터 로딩 기능**: `getTeamsWithUsers()`로 `teams.select("*, users(*)")` 단일 쿼리 도입
7. **캐릭터 시트 필드 실제 DB 컬럼명으로 정합화**: `name→username`, `tokenUrl→token_url`,
   `socialClass→social_class`, `gmSecret→gm_secret`, `playerGmSecret→player_gm_secret`
8. **캐릭터 저장/삭제 Supabase 연동 (최신)**: `saveUser`/`deleteUser` 추가,
   "Supabase에 저장" 버튼, `addCharacter()`가 `crypto.randomUUID()`로 유효 uuid 생성하도록 수정

---

## 8. 알려진 이슈 / 미확인 사항 (다음 작업자가 주의해야 할 것)

1. **`users` 테이블의 실제 컬럼 구성이 100% 확인되지 않음**
   `USER_SAVE_FIELDS`는 `supabase/schema.sql`의 `characters` 테이블 정의를 참고해
   추정한 것이며, 실제 라이브 DB의 `users` 테이블과 컬럼명이 다르면 저장이 실패하거나
   일부 필드가 조용히 누락될 수 있음.

2. **`progress_stages`와 `scenarios`/`scenario_questions`의 관계가 이원화되어 있음**
   - 트래커 목록(좌측 사이드바)의 소스: `progress_stages` (`step_number` 기준)
   - 질문/선택지 편집 대상: `scenario_questions`/`question_choices` (원래는 `scenarios.id` FK였으나
     `step_number` FK 컬럼으로 이관되었어야 함 — 실제 DB에 마이그레이션이 적용됐는지 재확인 필요)
   - `team_scenarios`도 `scenario_id`가 아니라 `step_number`로 매칭하도록 변경됨
   - 이 부분 스키마 정합성이 깨지면 "시나리오는 보이는데 질문/선택지가 안 나온다" 같은 문제가 재발할 수 있음

3. **RLS 정책 미검증**: `users`, `progress_stages`는 `schema.sql`에 정의되어 있지 않은
   사용자 자체 생성 테이블이므로, GM 계정이 insert/update/delete 가능한 RLS 정책이
   있는지 실제 Supabase 프로젝트에서 확인 필요.

4. **`team.characters` vs `team.users` 이중 관리**
   레거시 코드(`characterCount`, `galleryImages` 등)는 여전히 `team.characters`를 참조하고,
   신규 코드(캐릭터 그리드/시트)는 `team.users`를 참조함. 현재는 add/delete 시점마다
   양쪽을 수동으로 동기화(`team.users = team.characters` 등)하여 문제는 없지만,
   장기적으로 하나로 통일하는 리팩터링이 필요함.

5. **캐릭터 저장은 수동(버튼 클릭) 방식**: 자동 저장 아님. `addCharacter()`로 캐릭터를
   추가해도 즉시 DB에 insert되는 게 **아니라** 로컬에만 추가되고, "Supabase에 저장" 버튼을
   눌러야 실제 `users` 테이블에 upsert됨. (다만 `deleteCharacter()`는 즉시 DB에서도 삭제됨 —
   add와 delete의 저장 시점이 비대칭적이므로 주의)

6. **시나리오/분기 선택, GM 메모, 팀별 진행 상태(`team_scenarios`, `team_scenario_answers`)는
   아직 Supabase에 저장하는 버튼/로직이 연결되어 있지 않음.**
   `saveScenario()`, `saveTeamScenario()` 함수는 `db.js`에 이미 구현되어 있지만
   `HomeView.vue`의 시나리오 트래커 화면에서는 아직 호출되지 않고 있음 (다음 작업 후보).

7. **`npm run build`는 정적 오류만 잡아냄** — 실제 Supabase 스키마 불일치, RLS 거부,
   FK 관계 누락 등 런타임 오류는 build/lint로 검증되지 않으며 실사용 테스트가 필요함.

---

## 9. 다음으로 예상되는 작업 후보

- [ ] 시나리오 트래커의 체크박스/라디오 선택, 완료 여부, GM 메모를 `saveTeamScenario()`로 실제 저장
- [ ] `progress_stages` ↔ `scenario_questions`/`question_choices`/`team_scenarios` FK 스키마를
      실제 Supabase 프로젝트에서 재점검(마이그레이션 SQL 적용 여부 확인)
- [ ] `users` 테이블 실제 컬럼과 `USER_SAVE_FIELDS` 일치 여부 확인
- [ ] `team.characters`/`team.users` 필드명 통일
- [ ] 이미지 갤러리 업로드 → `images` 테이블 실제 insert 연동 여부 점검
- [ ] RLS 정책 재검토 (특히 `users`, `progress_stages`)

---

## 10. 다른 AI에게 질문할 때 참고할 요약 프롬프트 예시

> "Vue 3 Options API + Supabase로 만든 TRPG GM 대시보드야. `teams`(파티), `users`(캐릭터,
> team_id FK), `progress_stages`(시나리오 진행단계 목록, step_number 기준), `scenario_questions`
> /`question_choices`(분기/선택지), `team_scenarios`/`team_scenario_answers`(팀별 진행상태/답변)
> 테이블 구조를 쓰고 있어. 메인 로직은 `src/views/HomeView.vue` 한 파일에 다 있고,
> Supabase 통신은 `src/services/db.js`에 모아뒀어. [여기에 구체적 질문/에러 붙여넣기]"

이 문서와 함께 `src/views/HomeView.vue`, `src/services/db.js`, `supabase/schema.sql` 파일을
같이 첨부하면 다른 AI가 빠르게 맥락을 파악할 수 있습니다.
