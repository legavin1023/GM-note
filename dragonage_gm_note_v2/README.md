# DragonAge TRPG 캠페인 관리 사이트

Vue 3와 Supabase로 만든 TRPG 캠페인 관리 및 플레이어 포털입니다. 마스터는 캠페인·팀·캐릭터·시나리오 진행을 관리하고, 플레이어는 캐릭터 PIN으로 로그인해 팀 진행 상황과 게시판을 이용합니다.

## 주요 기능

### 로그인과 권한

- 마스터: Supabase Auth로 로그인하며 DB의 `current_user_is_gm()` 검사로 관리자 기능을 제한합니다.
- 플레이어: 기존 캐릭터 계정과 4자리 PIN을 사용합니다. PIN 확인은 `verify_user_pin` RPC와 `player-login` Edge Function에서 처리합니다.
- 플레이어 로그인 시 Supabase Auth 세션을 연결하고, 팀·캐릭터 범위는 `player_character_context()` 등 서버 함수와 RLS로 확인합니다.
- 마스터는 플레이어 화면 미리보기 모드를 사용할 수 있습니다. 마스터 전용 작업은 미리보기에서 숨기거나 비활성화됩니다.
- 라우트 가드는 화면 접근을 제어하고, 실제 데이터 권한은 Supabase RLS와 RPC가 담당합니다.

### 홈 대시보드

- 전체공지 최신 항목, 새 게시글·댓글 미리보기를 보여줍니다.
- 팀별 시나리오 진행률과 팀·시나리오·캐릭터 수를 확인할 수 있습니다.
- 플레이어에게는 팀 진행 요약을 제공하고, 마스터에게는 전체 캠페인 현황을 제공합니다.
- 완료되지 않은 공개 시나리오가 있으면 확인 안내를 표시합니다.

### 캠페인, 팀, 캐릭터

- 여러 캠페인과 팀, 팀별 진행 단계 및 캐릭터를 관리합니다.
- 캐릭터 프로필에는 이름, 플레이어, 나이, 키, 체중, 종족, 직업, 배경, 사회 계층, 동기, 목표, 강점, 언어, 특징, 특이 사항, 소개와 토큰 이미지가 포함됩니다.
- 마스터 전용 캐릭터 비밀 메모와 팀 토큰 갤러리를 지원합니다.
- 플레이어는 본인 캐릭터의 공개 프로필 변경을 요청할 수 있고, 마스터가 승인해야 반영됩니다.
- 캐릭터 상세와 팀 상세에서 프로필, 파티원 메모, 해당 캐릭터가 태그된 작품 글을 확인할 수 있습니다.
- 팀 캐릭터 목록은 각 팀의 전체 파티원을 표시합니다.

### 시나리오 트래커

- 공통 시나리오·질문·선택지와 팀별 답변·완료 상태·마스터 메모를 분리해 관리합니다.
- 마스터는 캠페인 시나리오를 관리하고 팀 진행을 확인합니다.
- 플레이어는 정책에 따라 지난 시나리오와 완료된 팀들의 선택을 확인하고, 허용된 본인 팀 기록을 수정할 수 있습니다.
- 사용하지 않는 진행 단계는 마스터가 비활성화할 수 있습니다. 기존 기록은 삭제하지 않습니다.
- 시나리오별 주요 NPC 목록과 NPC 피드백 페이지로 이동할 수 있습니다.
- 시나리오에 연결한 HTML 로그 백업을 트래커에서 바로 열 수 있습니다.

### 작품 게시판과 자유게시판

- 팀 작품 게시판은 팀 진행 기록이나 공지와 분리된 이미지·글·댓글 게시판입니다.
- 전체글과 팀별 필터를 제공하며, 현재 정책 설정에 따라 로그인한 사용자는 모든 팀 작품을 조회할 수 있습니다.
- 글에는 이미지 최대 10장, 댓글에는 텍스트 및 이미지, 캐릭터 태그, 스포일러 표시를 지원합니다.
- 캐릭터 태그를 선택해 관련 글을 모아볼 수 있고, 팀 전체 태그는 팀 캐릭터 전체를 태그합니다. 마스터 작품 탭은 마스터 관련 그림을 모읍니다.
- 스포일러 글은 목록 미리보기에서 가릴 수 있고, 마스터가 스포일러 상태를 관리할 수 있습니다.
- 게시글·댓글 작성자와 이미지 프로필은 게시판 컴포넌트의 사용자/캐릭터 정보에 따라 표시됩니다.
- 자유게시판은 작품 게시판 및 기존 팀 게시판과 별도 테이블을 사용합니다.

### 파티원 메모와 시나리오 한마디

- 시나리오 한마디는 팀·시나리오와 작성·대상 캐릭터를 연결해 시간순으로 모아봅니다. 공개 여부와 작성자 표시를 설정할 수 있습니다.
- 파티원 메모는 대상 캐릭터별로 쌓이며, 팀 공유 또는 작성자 비공개 범위를 지원합니다.
- 메모에 날짜와 시나리오를 선택적으로 연결할 수 있습니다.
- 팀 상세의 메모 탭에서 팀원들이 작성한 메모를 시나리오 시간순으로 볼 수 있습니다.
- 작성자는 본인 메모를 수정·삭제할 수 있습니다. DB 트리거가 작성자·팀·캐릭터 관계를 검증합니다.

### NPC와 마스터 작품

- 마스터는 시나리오별 주요 NPC의 이름, 나이, 성별, 토큰 이미지를 등록·수정·삭제할 수 있습니다.
- 플레이어는 정책상 공개된 NPC를 보고 별점과 댓글을 남길 수 있습니다.
- NPC 노출은 팀의 진행 단계와 RLS 정책을 따릅니다.

### 전체공지

- 기존 `public.notices` 테이블을 사용해 기존 공지와 DB 트리거를 보존합니다.
- 로그인 사용자는 공지를 목록·상세로 볼 수 있고, 마스터는 작성·수정·삭제할 수 있습니다.
- 홈에는 최신 공지 제목이 표시됩니다. 공지 Realtime은 프로젝트의 publication 설정에 따라 동작하며, 일반 조회와 새로고침은 별도로 제공됩니다.

### 팀 HTML 로그 백업

- 마스터가 팀과 선택 시나리오를 지정해 HTML 로그를 업로드·삭제할 수 있습니다.
- 플레이어는 본인 팀의 로그를 읽을 수 있습니다.
- HTML은 격리된 sandbox iframe에서 스크립트 없이 표시됩니다.
- 파일은 비공개 `team-log-backups` 버킷에 저장되며 기본 제한은 10 MiB입니다.

### 이미지 갤러리와 공통 UI

- 캠페인 토큰 갤러리와 작품 이미지 미리보기·확대 기능을 제공합니다.
- 메뉴 검색, 다크 모드, 백업 관련 메뉴, 알림 표시 등 공통 탐색 기능을 제공합니다.
- 화면은 모바일 폭에 맞춰 재배치되며, 긴 글과 이미지는 줄바꿈·스크롤·반응형 크기로 처리합니다.

### 시나리오 관리 및 백업

- 마스터는 시나리오 JSON을 GUI로 편집하고 JSON을 가져오거나 내보낼 수 있습니다.
- 질문·선택지 코드를 기준으로 기존 팀 기록 연결을 유지합니다.
- 앱의 데이터 백업 기능과 별도로, 실제 DB 백업은 Supabase 프로젝트 설정에서 관리해야 합니다.

## 기술 스택

- Vue 3, Vue Router 4 (Hash History), Vuex 4
- Vue CLI 5, SCSS/CSS
- Supabase Postgres, Auth, Storage, Row Level Security, RPC, Edge Functions
- Node.js 18 이상 (Discord 게시판 알림 스크립트를 사용할 경우)

## 시작하기

### 1. 설치

```bash
npm install
```

### 2. 프런트엔드 환경변수

프로젝트 루트에 `.env`를 만들고 아래 항목을 설정합니다. 공개 가능한 Supabase anon key만 사용하세요. `service_role` 키와 Discord 웹훅 주소를 프런트엔드 환경변수에 넣지 마세요.

```env
VUE_APP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VUE_APP_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### 3. Supabase 설정

1. 아래 마이그레이션 순서에 따라 SQL Editor에서 필요한 SQL 파일을 적용합니다.
2. 플레이어 로그인을 사용하려면 `player-login` Edge Function을 배포하고 필요한 Supabase Function secrets가 설정되어야 합니다. 자세한 내용은 [docs/player-access.md](./docs/player-access.md)를 참고하세요.
3. Storage 버킷·정책, Auth 사용자, Realtime publication은 프로젝트의 실제 설정과 마이그레이션을 확인하세요. SQL 파일이 저장소에 있다는 것만으로 원격 DB에 적용된 것은 아닙니다.
4. 실제 DB 변경은 운영 환경 백업 후 Supabase SQL Editor에서 별도로 적용합니다. 이 저장소의 문서는 배포를 자동 실행하지 않습니다.

### 4. 개발 서버와 검사

```bash
npm run serve
npm run lint
npm run build
```

## Supabase SQL 적용 순서

파일은 재실행 안전성을 일부 고려하지만, 기능별 선행 관계가 있습니다. 기존 프로젝트에 이미 적용된 스키마를 확인한 뒤 누락된 파일만 적용하세요. `migration_v2.sql`은 기본 스키마용입니다.

### 기본 계정과 권한

1. `supabase/migration_v2.sql`
2. `supabase/migration_player_access.sql`
3. `supabase/migration_player_account_admin.sql`
4. `supabase/migration_shared_gm_permissions.sql`
5. `supabase/migration_player_pin_enrollment.sql` (최초 PIN 설정 및 로그인 시도 제한)
6. `supabase/migration_fix_teams_policy_recursion.sql` (팀 정책 재귀 문제를 수정하는 프로젝트라면 적용)

플레이어 Edge Function 배포는 [플레이어 로그인 설정](./docs/player-access.md)을 따릅니다.

### 플레이어 프로필과 트래커

1. `migration_player_team_assets.sql`
2. `migration_player_tracker_visibility.sql`
3. `migration_team_scenarios_access.sql`
4. `migration_player_tracker_auto_complete.sql` (자동 완료 기능 사용 시)
5. `migration_progress_stage_activation.sql` (트래커 공개 범위 SQL 적용 후)
6. `migration_player_character_change_requests.sql`
7. `migration_scenario_order_edit.sql` (마스터의 시나리오 순서 편집 기능 사용 시)
8. `migration_character_gm_notes.sql`

### 자유게시판과 팀 작품 게시판

1. `migration_free_board.sql`
2. `migration_team_art_board.sql` (위 기본 계정, 플레이어 접근, shared GM 권한 이후)
3. `migration_team_art_character_tags.sql`
4. `migration_team_art_profile_avatars.sql`
5. `migration_team_art_images_10.sql` (게시글 이미지 최대 10장 설정)
6. `migration_team_art_all_teams_read.sql` (같은 캠페인 내 전체 팀 보기 정책)
7. `migration_team_art_all_users_read.sql` (모든 로그인 사용자의 전체 팀 작품 보기 정책; 앞선 팀 작품 조회 정책을 최종 대체)

마스터 NPC/작품 탭을 추가한다면 `migration_npc_lore_and_master_art.sql`을 위 팀 작품 관련 SQL 뒤에 적용합니다. 작품 글 이전은 원본 행을 삭제하지 않고 새 테이블로 복사하도록 작성되어 있습니다. 원본 스키마와 사용자 ID 형식을 먼저 확인하세요.

### 공지, 메모, HTML 로그

1. `migration_notices_access.sql` (기존 `notices` 테이블을 유지)
2. `migration_global_notices.sql`은 별도 `global_notices` 기능을 쓰는 환경에만 적용하며 `notices`와 목적이 다릅니다.
3. `migration_character_memory_notes.sql` (파티원 메모와 시나리오 한마디)
4. `migration_team_log_backups.sql`
5. `migration_team_log_backups_scenario.sql` (로그를 시나리오에 연결하는 기능)

`supabase/diagnostics.sql`과 `supabase/diagnostics_all_features.sql`은 읽기 전용 확인 쿼리입니다. 운영 DB의 실제 스키마·정책을 점검할 때 사용할 수 있지만, 정책 의미가 올바른지까지 자동 보증하지는 않습니다.

## 선택 기능: Discord 작품 게시판 알림

`scripts/discord-board-watcher.cjs`는 Supabase Auth 전용 계정으로 게시판을 조회해 신규 작품 글을 Discord 웹훅으로 보냅니다. 첫 실행 때 기존 글은 기준점으로 저장하고, 이후 새 글부터 알립니다. 웹훅은 로컬 `.env`에만 보관합니다.

환경변수와 실행 방법은 [docs/discord-board-watcher.md](./docs/discord-board-watcher.md)를 참고하세요. 봇 계정에는 게시글 조회 권한만 부여하고 RLS를 우회하지 마세요.

## 주요 경로

| 경로 | 화면 |
| --- | --- |
| `/login` | 플레이어 로그인 기본 화면 및 마스터 로그인 전환 |
| `/home` | 홈 대시보드와 공지·최근 활동 |
| `/master` | 마스터 캠페인 현황 |
| `/teams`, `/teams/:teamId` | 팀 목록과 팀 상세 |
| `/characters`, `/characters/:characterId` | 캐릭터 목록과 상세 |
| `/scenarios`, `/scenarios/:scenarioId` | 시나리오 트래커와 상세 |
| `/scenarios/:scenarioId/npcs` | 시나리오 주요 NPC |
| `/npcs/:npcId` | NPC 평점 및 댓글 |
| `/gallery` | 토큰 갤러리 |
| `/board/free` | 자유게시판 및 작품 글 연결 |
| `/notices`, `/notices/:noticeId` | 전체공지 목록과 상세 |

## 주요 코드 위치

- `src/router/index.js`: 라우트, 로그인 및 관리자 가드
- `src/store/index.js`: 앱과 사용자 상태
- `src/views/DashboardLayout.vue`: 공통 메뉴·레이아웃·플레이어 미리보기
- `src/views/HomeDashboardView.vue`: 홈 대시보드
- `src/views/TeamDetailView.vue`: 팀 정보, 트래커, 로그 백업, 팀 캐릭터 팝업
- `src/views/CharactersView.vue`, `src/views/CharacterDetailView.vue`: 캐릭터 목록·상세
- `src/views/ScenariosView.vue`, `src/views/ScenarioDetailView.vue`: 트래커·시나리오 상세
- `src/views/FreeBoardView.vue`: 자유게시판과 작품 게시판
- `src/views/NoticesView.vue`: 전체공지 목록·상세·작성·수정
- `src/components/CharacterNotesPanel.vue`: 파티원 메모와 시나리오 한마디
- `src/components/TeamArtPreview.vue`: 팀 작품과 토큰 미리보기
- `src/components/CharacterTaggedPostsPanel.vue`: 캐릭터 태그 작품 모아보기
- `src/services/`: Supabase 도메인 서비스
- `supabase/`: SQL 마이그레이션, 진단 쿼리, Edge Function

## 보안 및 운영 메모

- PIN은 브라우저 프로필이나 로컬 저장소가 아니라 서버 RPC에서 검증합니다. PIN 해시와 `service_role` 키를 클라이언트에 보내지 마세요.
- 플레이어 프로필 상태만으로 Supabase 인증이 성립한다고 간주하지 마세요. 데이터 접근은 Auth 세션과 RLS 정책을 기준으로 검증해야 합니다.
- 공지·작품·메모·로그의 실제 접근 권한은 현재 원격 DB의 RLS 정책에 달려 있습니다. 배포 전에 진단 쿼리와 Supabase 정책을 확인하세요.
- SQL 마이그레이션은 저장소의 제안 상태와 원격 DB 적용 상태가 다를 수 있습니다. 적용 기록을 별도로 관리하세요.
- 사용자 작성 HTML은 격리 iframe에서 표시하고, 신뢰할 수 없는 파일을 공개 Storage에 두지 마세요.
