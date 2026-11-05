# 게시글 · 댓글 · 공지 · 세션 · 마스터 최근활동 Web Push 설정

## 공지·세션·최근활동 추가 (2026-10-06)

사이드바 **알림 설정** (`/notifications`)에서 기존 새 글/댓글과 별도로 **새 공지**, **세션 시작 10분 전**, **최근활동 (마스터 전용)**을 켤 수 있습니다. 새 옵션은 기존 구독에서도 기본 꺼짐이며, 사용자가 체크한 뒤 **설정 저장**을 눌러야 합니다. 기존 게시판의 알림 설정도 같은 기기 구독을 사용합니다.

- **공지:** 실제 `public.notices` INSERT → 새 `campaign-push` 함수. 알림을 누르면 `/notices/:noticeId`로 이동합니다. 공지 수정은 새 공지 알림을 보내지 않습니다. 팀 선택과 무관합니다.
- **세션:** 팀 상세 페이지 **세션 일정**에서 마스터가 이름·날짜·시간을 등록/수정/취소합니다. 한국 시간(Asia/Seoul) 입력을 UTC timestamptz로 저장합니다. `team_sessions` RLS로 마스터만 변경하고 플레이어는 자기 팀만 조회합니다.
- 팀별 **월간 달력**에서 날짜를 클릭하고 시간을 입력합니다. 달력과 날짜별 목록은 해당 팀 데이터만 조회합니다. 이전/다음 달 이동, 같은 날 여러 세션, 일정 수정/취소를 지원합니다. `migration_team_session_isolation.sql`도 적용하여 기존 일정의 team_id 변경을 DB에서 금지했습니다. 팀 A 일정은 팀 B 플레이어에게 전송되지 않으며, ‘전체 팀’ 알림 선택도 플레이어의 팀 접근 권한을 우회하지 않습니다. 마스터는 권한상 각 팀 일정을 확인/수신할 수 있습니다.
- 서버 `pg_cron`의 **campaign-session-push**가 매분 `tick_campaign_push()`를 실행합니다. 시작 시각이 10분 이내인 미래 일정만 큐에 등록합니다. 정상 동작 시 약 9~10분 전에 발송 요청됩니다. 브라우저/휴대폰 네트워크 상태에 따라 실제 수신은 지연될 수 있습니다. 시작 후에는 전송하지 않고, 취소·시간 변경을 발송 직전에 다시 검사합니다. 10분 미만 남은 시점에 등록한 일정은 다음 검사에서 알립니다.
- 세션 수신자는 알림을 켜고 해당 팀을 선택한 사용자 중 **마스터 또는 실제 그 팀의 플레이어**입니다. 플레이어의 실제 팀은 기존 `player_team_context()`와 동일하게 `player_team_members.login_username → users.username → users.team_id`로 확인하며, 모호한 중복 연결은 제외합니다. `player_team_members.team_id`는 사용하지 않습니다.
- **최근활동:** 대시보드의 목록을 마스터 전용 `/activity`로 옮겼습니다. 실시간 갱신과 이전 기록 더 보기를 지원합니다. 기존 상단 알림 메뉴에도 같은 카드 형식으로 최근활동을 추가했으며 클릭하면 전용 페이지로 이동합니다. Web Push는 옵션을 켠 마스터만 받고, 서버에서도 `public.users.role = admin`을 확인합니다. 팀 필터는 최근활동에 적용하지 않습니다.
- 로그인 세션이 끝났어도 알림으로 연 내부 링크는 로그인 뒤 같은 공지/팀/최근활동 화면으로 이어집니다. 플레이어에게 최근활동 페이지/데이터는 공개되지 않습니다.
- 새 알림 큐는 기기별 발송 기록과 이벤트 처리 잠금으로 병렬/재시도 중 중복을 줄입니다. 실패는 매분 재시도하며 성공한 기기는 건너뜁니다. 공지는 24시간, 활동은 30분, 세션은 시작 시각까지 재시도합니다. Push 서비스가 수락했으나 응답을 잃은 경우까지 완전한 exactly-once 수신을 보장하지는 않습니다. 만료된 기기(404/410)는 정리합니다.
- DB→Edge 요청 인증에는 기존 Vault `web_push_webhook_secret`과 서버 `PUSH_WEBHOOK_SECRET`, VAPID 설정을 재사용합니다. 클라이언트에 새 비밀 키를 넣지 않았습니다. 기존 `new-post-push`와 Discord는 유지됩니다.

**원격 적용 완료:** `migration_push_notice_session_activity.sql`, `campaign-push` 배포, 예약 활성화, RLS/역할별 수신·팀 선택·10분 전 예약·취소·중복 방지 롤백 테스트, 서버 HTTP 401/400/200 확인. 게시글/댓글 트리거 유지도 확인했습니다. 휴대폰 실제 수신은 별도 확인이 필요합니다.

재설정할 때만:

1. Supabase Dashboard → **SQL Editor → New query**에서 `supabase/migration_push_notice_session_activity.sql` 실행. 기존 Web Push 기본/환경설정 migration이 먼저 적용되어 있어야 합니다.
2. `supabase functions deploy campaign-push --project-ref cammbwzdpymunyobvszu --no-verify-jwt --use-api` 실행. 기존 Secrets를 사용하므로 추가 키 생성은 필요 없습니다.
3. Dashboard → **Integrations → Cron**에서 `campaign-session-push`가 활성화되고 `* * * * *`인지 확인합니다. 원격 적용을 이미 했으므로 별도 Database Webhook을 추가하지 마세요.
4. 함수 로그는 **Edge Functions → campaign-push → Logs**, 예약 결과는 **Integrations → Cron → 해당 작업**에서 확인합니다.

기기 테스트: 알림 설정에서 원하는 종류 체크→저장, 마스터로 공지 등록 또는 12분 뒤 팀 세션 등록, 앱을 닫고 수신/클릭 확인. 최근활동은 마스터 기기에서 옵션을 켜고 다른 계정으로 메모 등 변경 후 확인합니다. Android는 Chrome, iPhone/iPad는 Safari 홈 화면 앱(iOS/iPadOS 16.4 이상)에서 실행하세요. 개발 확인은 `node --test tests/web-push.test.mjs tests/campaign-push.test.mjs`, `npm run build`를 사용합니다. 서버 검사 스크립트는 `node --use-system-ca scripts/web-push-admin.cjs verify-expansion`입니다. 운영 DB 테스트 행은 모두 롤백하며 테스트용 공지/활동을 발송하지 않습니다.

추가 파일: `TeamSessionsPanel.vue`, `RecentActivityView.vue`, `NotificationSettingsView.vue`, `pushRoutes.mjs`, `supabase/functions/campaign-push/*`, 새 migration/진단/검증 SQL, `tests/campaign-push.test.mjs`. 수정 파일: 기존 알림 컴포넌트/서비스, Service Worker, Router/LoginView, DashboardLayout, MasterView, TeamDetailView, Supabase 함수 설정 및 배포 도우미.

서버 예약 방식은 [Supabase 공식 Cron/Edge Function 예약](https://supabase.com/docs/guides/functions/schedule-functions)을 따릅니다. 주간 백업은 중단 상태를 유지합니다.

---

2026-10-06에 `dragonage-trpg` (`cammbwzdpymunyobvszu`)의 SQL, 서버 Secrets, Edge Function, 게시글/댓글 INSERT Trigger를 적용하고 GitHub Pages 배포까지 완료했습니다. 실제 사이트에서 새 앱 빌드, PWA Manifest, 댓글 알림 Service Worker를 확인했습니다. 자동 테스트 13개와 운영 빌드를 통과했고, 원격 DB→Edge Function은 HTTP 200으로 검증했습니다. 아직 실제 휴대폰 구독/수신은 테스트하지 않았습니다. 아래 설치 절차는 재설정할 때 참고하는 안내입니다. 이미 적용된 Webhook을 중복 생성하지 마세요. 기존 Discord 스크립트/환경변수는 그대로 사용합니다.

## 사용자가 고를 수 있는 설정

작품 게시판 또는 사이드바의 **알림 설정**에서 기기별로 다음을 선택합니다. 아래 두 항목 외에 위에서 설명한 공지·세션·마스터 최근활동도 선택 가능합니다.

- **전체 팀 · 마스터 작품** 또는 **선택한 팀만** (팀별 체크박스, 마스터 작품 별도 체크).
- **새 글 알림**, **내 글에 달린 댓글 알림**을 각각 켜거나 끌 수 있습니다.
- 팀 선택은 두 알림 종류에 함께 적용됩니다. 내 글 댓글 알림은 `게시글.user_id = 구독.user_id`인 경우에만 전송하고, 본인이 직접 쓴 댓글은 제외합니다.
- 기본값은 전체 팀의 새 글 알림 켜짐, 내 글 댓글 알림 꺼짐입니다. 신청 후 변경했다면 **설정 저장**을 누릅니다. 두 종류를 모두 끄고 저장하면 일시중지되며 **알림 해제**는 기기 구독까지 제거합니다.
- 설정은 기기별 구독에 저장됩니다. 휴대폰 두 대라면 각각 설정할 수 있습니다.

공개 키는 Git에서 제외된 `.env.local`에, 비밀 키는 Git에서 제외된 `supabase/functions/.env`와 Supabase 서버 Secrets에 저장했습니다. Webhook 인증 Secret은 DB의 Supabase Vault에도 암호화 저장됩니다.

## 이 프로젝트의 배포 도구

`scripts/web-push-admin.cjs`는 로그인된 Supabase CLI와 Windows 시스템 인증서를 사용해 이 프로젝트만 설정합니다 (현재 Node 24 환경). Secret 값은 출력하지 않습니다.

```powershell
node scripts/web-push-admin.cjs inspect
node scripts/web-push-admin.cjs prepare
node scripts/web-push-admin.cjs migrate
node scripts/web-push-admin.cjs secrets
node scripts/web-push-admin.cjs deploy
node scripts/web-push-admin.cjs webhook
node --use-system-ca scripts/web-push-admin.cjs verify
node --use-system-ca scripts/web-push-admin.cjs verify-site
```

`prepare`는 기존 로컬 키를 유지합니다. 기존 원격 키가 있는데 로컬 키 파일이 없으면 임의로 새 키로 교체하지 않습니다. `verify`는 존재하지 않는 게시글/댓글 ID로 인증 및 DB→함수 연결을 확인하므로 실제 글이나 알림을 만들지 않습니다. 운영 키를 재생성하거나 위 명령을 다시 실행할 필요는 없습니다.

## 확인한 프로젝트 구조

- Vue 3 + Vue CLI 5 + Vue Router 4 Hash History + Vuex 4. `src/main.js`, `src/router/index.js`, `src/store/index.js`.
- `src/supabase.js`: `VUE_APP_SUPABASE_URL`, `VUE_APP_SUPABASE_ANON_KEY`로 Supabase JS v2 연결.
- 현재 작품 게시글은 `public.team_art_posts`. 실제 컬럼은 `id` (UUID), `team_id`, `user_id`, `nickname`, `avatar_url`, `content`, `image_paths`, `is_spoiler`, `is_master_artwork`, `character_tags`, `created_at` 등. **title 컬럼은 없습니다.** 알림은 기존 Discord와 동일하게 본문 첫 번째 비어 있지 않은 줄을 제목 대신 사용합니다. 이미지 전용 글은 `이미지 작품 게시글`. 스포일러 글은 본문 대신 안내 문구를 보냅니다.
- 작성: `src/views/FreeBoardView.vue`의 `createPost()`에서 `team_art_posts.insert(...)`. 댓글은 실제 `public.team_art_comments`의 `id`, `post_id`, `user_id`, `nickname`, `content`, `image_path`를 사용합니다. 공지(`notices`), 과거 `free_board_posts`는 알림 대상이 아닙니다.
- 상세 표시: 별도 `/posts/:id` 라우트가 아니라 `free-board` 라우트 `/board/free?postId=<UUID>`에서 글 하나를 조회하고 스크롤합니다. 운영 빌드는 `/GM-note/#/board/free?postId=<UUID>`입니다.
- GM 이메일/비밀번호, 플레이어 캐릭터/PIN 모두 실제 Supabase Auth 세션을 사용합니다. 구독 `user_id`는 캐릭터 테이블 `public.users.id`가 아니라 **`auth.users.id`**입니다.
- Discord: `scripts/discord-board-watcher.cjs`가 전용 Auth 계정으로 작품 테이블을 폴링한 뒤 Discord Webhook 전송. 프론트엔드 INSERT에 붙은 코드가 아닙니다. 실행 위치가 실제로 어디인지 저장소만으로 확인할 수는 없습니다. 기존 운영 방식을 유지하세요. Web Push는 이 스크립트 실행 여부와 독립적입니다.
- 배포: `vue.config.js`의 운영 `publicPath=/GM-note/`, `npm run deploy`는 `gh-pages -d dist`, Git remote는 `https://github.com/legavin1023/GM-note`. 실제 `https://legavin1023.github.io/GM-note/`의 HTTP 200 응답과 DragonAge 앱을 확인했습니다.
- 기존 Service Worker/PWA는 발견되지 않았습니다. 새 Worker는 앱 경로에만 등록되며 인증 응답/작품 데이터를 캐시하지 않습니다. 인터넷 연결이 필요한 PWA입니다.

## 생성/수정 파일

생성:

- `public/manifest.webmanifest`, `public/sw.js`
- `public/icons/icon-192.png`, `public/icons/icon-512.png` (기존 DA 브랜드 형태)
- `src/services/push.js`, `src/components/PushSubscriptionButton.vue`
- `supabase/migration_web_push.sql`
- `supabase/migration_web_push_preferences.sql`, `supabase/web_push_webhook.sql`
- `supabase/diagnostics_web_push.sql`, `supabase/verify_web_push.sql`
- `supabase/functions/new-post-push/index.ts`, `helpers.mjs`
- `scripts/generate-vapid-keys.cjs`, `scripts/generate-pwa-icons.ps1`
- `scripts/web-push-admin.cjs`
- `tests/web-push.test.mjs`, 이 문서

수정:

- `public/index.html`: Manifest, Apple 설치용 아이콘/메타 태그
- `src/main.js`: Worker 등록 (권한 요청 없음)
- `src/views/FreeBoardView.vue`: 게시판 상단 알림 신청/해제 UI
- `src/router/index.js`, `src/views/LoginView.vue`: 알림 링크의 로그인 후 복귀
- `supabase/config.toml`: 새 Webhook 함수만 JWT 자동 검증 해제
- `.env.example`: 공개 VAPID 및 기존 프론트엔드 Supabase 변수 예시 추가
- `.gitignore`: 로컬 Supabase 연결 정보가 있는 `supabase/.temp/` 제외
- `README.md`: 설정 문서 링크

추가 npm 패키지 설치는 필요하지 않습니다. Edge Function은 고정된 `npm:web-push@3.6.7`, `npm:@supabase/supabase-js@2.116.0`를 사용합니다.

## 1. VAPID 키 생성 (한 번)

프로젝트 터미널에서:

```powershell
node scripts/generate-vapid-keys.cjs
```

출력은 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET` 세 값입니다. 비밀 키/Secret은 비공개 비밀번호 저장소에 보관하세요. 배포 때마다 재생성하지 않습니다. 키를 바꾸면 기존 브라우저 구독을 해제하고 다시 신청해야 합니다. 이 스크립트는 파일을 쓰지 않습니다.

재설정 시 프로젝트 루트 `.env.local`에 **공개 키만** 추가하고 개발 서버를 재시작하거나 다시 빌드하세요:

```dotenv
VUE_APP_VAPID_PUBLIC_KEY=생성한_VAPID_PUBLIC_KEY
```

기존 `VUE_APP_SUPABASE_URL`, `VUE_APP_SUPABASE_ANON_KEY`, Discord 설정을 유지합니다. 비밀 키와 service role에는 절대로 `VUE_APP_` 접두어를 붙이지 않습니다.

## 2. Supabase SQL 적용

1. Supabase Dashboard → 해당 프로젝트 → **SQL Editor → New query**.
2. `supabase/migration_web_push.sql` 전체를 붙여넣고 **Run**, 이어서 `supabase/migration_web_push_preferences.sql`을 실행합니다.
3. **Table Editor**에서 `push_subscriptions`, `push_event_deliveries`가 생성되었는지 확인합니다. 초기 버전의 `push_deliveries`는 과거 발송 기록 보존을 위해 유지합니다.
4. **Authentication → Users**에서 기존 로그인 계정이 정상인지 확인합니다. 새 Auth 계정/테이블 변경은 필요 없습니다.

구독 테이블은 endpoint 전역 UNIQUE로 중복을 막습니다. RLS는 본인 데이터의 SELECT/INSERT/UPDATE/DELETE만 허용하며 익명 접근을 막습니다. 발송 이력 테이블과 두 RPC는 service role만 접근합니다. 공개 키를 제외한 비밀 값은 이 테이블에 저장하지 않습니다.

저장소의 최종 작품 읽기 정책인 `migration_team_art_all_users_read.sql`은 모든 로그인 사용자에게 작품 조회를 허용합니다. 발송 함수는 실제 DB의 정책을 확인하며 전체 읽기 정책이 없거나 restrictive 정책이 있으면 **409로 발송을 중단**합니다. 기존 팀별 접근 제한을 알림 때문에 풀지 마세요. 프로젝트가 실제로 팀별 비공개 정책을 유지한다면 팀별 수신 대상 설계가 추가로 필요합니다. 이번 SQL은 기존 작품 정책을 변경하지 않습니다.

## 3. Edge Function Secrets

Dashboard → **Edge Functions → Secrets**에서 다음 이름/값을 등록합니다 (UI 버전에 따라 Functions 화면의 Secrets 탭).

- `VAPID_PUBLIC_KEY`: 생성한 공개 키. 프론트엔드 값과 정확히 같아야 함.
- `VAPID_PRIVATE_KEY`: 생성한 비밀 키.
- `VAPID_SUBJECT`: 연락 가능한 실제 `mailto:` 주소 또는 사이트의 HTTPS URL. 현재는 `https://legavin1023.github.io/GM-note/`를 사용합니다.
- `PUSH_WEBHOOK_SECRET`: 생성한 랜덤 Secret.
- `PUSH_SITE_URL`: **실제 앱 기본 URL**, 마지막 `/` 포함. 예: `https://legavin1023.github.io/GM-note/`. `#/...`나 쿼리는 넣지 않음. 커스텀 도메인이라면 그 실제 주소 사용.

호스팅된 Supabase 함수에는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 기본 제공됩니다. 프론트엔드 `.env`에 service role을 추가하지 마세요. 새 `PUSH_SITE_URL`은 Discord의 기존 `SITE_URL`과 별개이므로 Discord 설정을 건드리지 않습니다.

CLI로 등록하려면 비공개 파일 `supabase/functions/.env`에 위 값을 넣고 아래를 사용하세요. `.env` 파일은 Git에서 제외됩니다. **로컬 함수용 Secret 파일도 저장소에 커밋하지 않습니다.**

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set --env-file supabase/functions/.env
```

프로젝트 ref는 Dashboard 프로젝트 URL 또는 **Project Settings → General**에서 확인합니다.

## 4. Edge Function 배포

프로젝트 루트에서 (CLI가 package.json에 이미 포함됨):

```powershell
npx supabase functions deploy new-post-push --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

함수 이름은 **`new-post-push`**입니다. Dashboard → **Edge Functions → new-post-push → Details / Settings**에서 배포와 JWT 검증 비활성 상태를 확인합니다. `supabase/config.toml`에도 해당 함수만 `verify_jwt=false`로 설정했습니다. 함수 내부는 `x-push-webhook-secret`를 반드시 검증하므로 일반 사용자가 발송을 호출할 수 없습니다.

Dashboard 편집기로 배포한다면 `index.ts`와 같은 디렉터리의 `helpers.mjs`를 모두 추가해야 합니다. CLI 배포를 권장합니다.

## 5. Database Webhook 연결

**현재 프로젝트에는 이 단계가 이미 적용되어 있습니다.** `supabase/web_push_webhook.sql`의 `team_art_new_post_push`와 `team_art_own_comment_push`가 각각 게시글/댓글 INSERT를 감지합니다. `public.notify_new_post_push()`가 Vault에서 인증 Secret을 읽어 pg_net으로 비동기 요청을 보냅니다. Dashboard → **Database → Triggers** 또는 SQL Editor에서 해당 Trigger를 확인할 수 있습니다. Trigger 인자나 함수 소스에는 비밀 값이 없습니다. 아래 Dashboard 방식은 다른 프로젝트를 처음 설정할 때 선택할 수 있는 대안이며 현재 프로젝트에 중복 적용하지 않습니다.

1. Dashboard → **Database → Webhooks** (UI에 따라 Integrations → Database Webhooks).
2. 최초 사용이면 **Enable Webhooks**를 눌러 pg_net 기반 Webhooks를 활성화합니다.
3. **Create a new webhook**.
4. Name: `team-art-new-post-push`.
5. Schema: `public`, Table: **`team_art_posts`**.
6. Events: **INSERT만** 선택. UPDATE/DELETE는 선택하지 않습니다.
7. Type: **HTTP Request**, Method: **POST**.
8. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/new-post-push`.
9. Headers:
   - `Content-Type`: `application/json`
   - `x-push-webhook-secret`: Secrets에 넣은 `PUSH_WEBHOOK_SECRET`과 같은 값
10. 요청 Timeout 항목이 있다면 `140000` ms를 설정합니다 (소규모 구독자는 훨씬 빨리 처리됨).
11. **Create / Save**. Webhook 본문은 DB가 생성하는 표준 INSERT payload를 그대로 사용합니다. 수동으로 `{title: ...}` 같은 본문을 만들지 않습니다.

Webhook은 DB의 비동기 Trigger이므로 Vue 이외의 INSERT도 알립니다. 발송 실패가 게시글 저장을 되돌리지 않습니다. 기존 Discord/다른 Trigger는 삭제하지 않습니다. 동일 기능의 Webhook을 두 개 만들지 마세요.

Dashboard 대신 SQL로 연결하려면 Webhooks를 활성화한 후 아래 예시의 URL/Secret을 비공개 SQL Editor에서 바꾸고 실행하세요. **Dashboard 방식과 SQL 방식 중 하나만 선택**합니다. 실제 Secret을 저장소 SQL에 쓰지 마세요.

```sql
CREATE TRIGGER team_art_new_post_push
AFTER INSERT ON public.team_art_posts
FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/new-post-push',
  'POST',
  '{"Content-Type":"application/json","x-push-webhook-secret":"YOUR_RANDOM_SECRET"}',
  '{}',
  '140000'
);
```

## 6. 로컬 테스트

자동 테스트는 TypeScript 함수의 인증 경계를 직접 검사하므로 Node.js 22.13 이상을 사용하세요. 프론트엔드 빌드와 VAPID 생성은 기존 프로젝트의 Node 환경을 사용합니다.

```powershell
node --test tests/web-push.test.mjs
npm run serve
npm run build
```

1. PC Chrome에서 `http://localhost:8080`의 실제 출력 포트로 접속하고 로그인합니다.
2. DevTools → **Application → Manifest**: 이름/아이콘/scope를 확인합니다. **Service Workers**: `sw.js`가 활성화되었는지 확인합니다.
3. 페이지를 열기만 해서는 알림 권한창이 뜨지 않아야 합니다.
4. 작품 게시판 → `🔔 새 글 알림 받기` 클릭 → 허용.
5. Dashboard → Table Editor → `push_subscriptions`: endpoint가 한 행만 저장되었는지 확인. 반복 클릭/새로고침은 중복 행을 만들지 않아야 합니다.
6. 다른 로그인 사용자로 직접 SELECT 시 본인 구독만 보이고, 다른 user_id로 INSERT/UPDATE는 RLS로 거부되는지 확인합니다.
7. **로컬 테스트는 운영 환경과 브라우저 구독이 다릅니다.** 로컬에서 등록하고 운영에서 확인하려면 운영 사이트에서도 별도로 신청합니다.

원격 DB Webhook을 쓰는 로컬 프론트엔드 테스트에서는 함수 `PUSH_SITE_URL`이 운영 주소이므로 알림 클릭도 운영 주소를 엽니다. 로컬 링크까지 확인하려면 별도 개발 Supabase 프로젝트/함수를 쓰고 `PUSH_SITE_URL=http://localhost:8080/`으로 설정하세요. 운영 Secret을 로컬 주소로 바꾸지 마세요.

전체 로컬 Supabase를 사용하는 경우 Docker가 필요합니다:

```powershell
npx supabase start
npx supabase functions serve new-post-push --no-verify-jwt --env-file supabase/functions/.env
```

기존 프로젝트 스키마 마이그레이션과 새 SQL을 로컬 SQL Editor에 적용하고 로컬 Supabase URL/anon key로 Vue를 실행합니다. 로컬 DB Webhook 주소는 Docker 안에서 접근 가능한 `http://host.docker.internal:54321/functions/v1/new-post-push`입니다. 실제 브라우저 Push endpoint로 보내므로 인터넷 연결도 필요합니다.

## 7. 사이트 배포 및 Android 확인

1. `.env.local` 공개 키를 확인한 뒤 기존 방식인 `npm run deploy`를 실행합니다 (빌드 후 GitHub Pages 배포).
2. GitHub → repo **Settings → Pages**에서 실제 HTTPS 배포 주소를 확인. 이 주소와 `PUSH_SITE_URL`을 맞춥니다.
3. `/GM-note/manifest.webmanifest`, `/GM-note/sw.js`, `/GM-note/icons/icon-192.png`가 404 없이 열리는지 확인합니다. 루트 도메인에 배포한다면 기존 `vue.config.js` publicPath도 실제 배포에 맞춰야 합니다.
4. Android Chrome으로 HTTPS 사이트 접속 → 로그인 → 작품 게시판 → 알림 받기 → 허용.
5. Chrome 메뉴 → **홈 화면에 추가 / 앱 설치**. Android Chrome은 설치하지 않은 브라우저 탭에서도 Web Push를 지원하지만 앱처럼 사용할 때는 설치를 권장합니다.
6. 사이트를 닫고 다른 기기/브라우저에서 새 작품 글 작성. 휴대폰 알림 확인 → 터치 → 해당 글 확인.
7. 앱이 이미 열린 상태에서도 알림 클릭 후 기존 창이 활성화되고 해당 글로 이동하는지 확인합니다.
8. `알림 해제` 후 행 삭제 및 다음 새 글 알림이 오지 않는지 확인합니다.

휴대폰에서 PC의 `http://192.168...` 개발 서버에 접속하면 보안 컨텍스트가 아니므로 Push를 사용할 수 없습니다. 모바일 테스트는 HTTPS 배포 주소를 사용하세요.

## 8. iPhone / iPad

1. **iOS/iPadOS 16.4 이상**에서 Safari로 실제 HTTPS 사이트를 엽니다.
2. Safari **공유 버튼 → 홈 화면에 추가 → 추가**. 최신 OS에서 메뉴가 접혀 있으면 공유 메뉴의 더 보기/편집에서 홈 화면에 추가 항목을 찾습니다.
3. Safari 탭이 아니라 **홈 화면에 생긴 DragonAge 아이콘**으로 실행합니다.
4. 해당 앱에서 로그인 → 작품 게시판 → `🔔 새 글 알림 받기` → **허용**.
5. 앱을 닫고 다른 기기에서 글 작성 → 잠금 화면/알림센터 확인 → 터치하여 해당 글 확인.
6. 설정 → **알림 → DragonAge**에서 알림 허용/배너/소리, 집중 모드 설정을 확인합니다.

일반 iOS Safari 탭에서는 앱 설치 방법을 안내하고 권한 요청을 시도하지 않습니다. 일반 웹 탭과 설치 앱은 로그인/구독 저장 공간이 다를 수 있으므로 설치 앱 안에서 로그인 및 신청하세요. Apple Developer 유료 가입이나 APNs 인증서를 추가할 필요가 없습니다.

## 9. 운영 검증 / 실패 확인

- 두 사용자/두 휴대폰에 각각 구독한 뒤 새 글 1개를 작성해 모두 받는지 확인합니다. 작성자도 구독자라면 알림을 받습니다.
- 한 기기는 팀 A만, 다른 기기는 전체 팀을 선택해 팀 B의 새 글은 전체 팀 기기에만 도착하는지 확인합니다. 마스터 작품 선택도 별도로 확인합니다.
- 새 글 알림을 끄고 내 글 댓글 알림만 켠 기기에서 다른 사람의 새 글은 오지 않고, 다른 사람이 내 글에 남긴 댓글은 도착하는지 확인합니다. 같은 글에 댓글 2개를 남겼을 때 각각 새 댓글 알림이 발생하는지 확인합니다.
- 본인이 자기 글에 남긴 댓글, 다른 사람의 글에 달린 댓글은 내 글 댓글 알림을 만들지 않아야 합니다. 두 알림 종류를 모두 끄고 설정 저장하면 이 기기에 새 알림이 오지 않아야 합니다.
- Discord 알림도 기존 운영 스크립트를 통해 계속 도착하는지 확인합니다. 새 Push 함수는 Discord를 호출하거나 Discord 설정을 바꾸지 않습니다.
- `notices` INSERT, 게시글 수정에서는 Push가 발생하지 않아야 합니다. 댓글 작성은 새 글 알림을 만들지 않으며, 댓글 알림을 켠 글 작성자에게만 선택한 팀 범위에서 전송합니다. 본인이 자기 글에 쓴 댓글은 전송하지 않습니다.
- DB 직접 INSERT 테스트는 기존 `user_id`, 팀/캐릭터 태그, 글 내용/이미지 CHECK 등을 지킨 유효한 행으로 진행합니다. 실제 행의 ID를 사용하세요.
- Dashboard → **Edge Functions → new-post-push → Invocations / Logs**에서 응답과 `sent`, `expired`, `failed`, `skipped` 집계를 확인합니다. endpoint/키/본문은 로그에 출력하지 않습니다.
- SQL Editor에서 아래로 비동기 Webhook 응답 확인 (pg_net 응답 보관 기간 내):

```sql
SELECT id, status_code, timed_out, error_msg, created
FROM net._http_response ORDER BY created DESC LIMIT 20;
```

- 401: Webhook Header Secret과 함수 Secret 불일치.
- 409: 실제 게시판 읽기 정책이 전체 로그인 사용자 대상이 아님. 정책을 무작정 바꾸지 말고 현재 접근 범위를 확인.
- 500: SQL/RPC 적용, 함수 Secrets, VAPID 연락처/키를 확인.
- 503: 일부 구독 전송 실패 또는 함수 시간 예산 초과. 정상 수신자는 계속 처리됨. 404/410만 만료로 삭제하고 429/5xx/네트워크 오류 구독은 보존.
- 수신 후 클릭 시 로그인 화면이 나오면 세션이 만료된 것입니다. 로그인하면 해당 글로 복귀합니다. GM/플레이어 로그인 전환 링크도 복귀 경로를 유지합니다.

Webhook은 영구적인 작업 큐나 무한 재시도를 제공하지 않습니다. 일시적인 전송 실패는 Logs로 확인한 뒤 **Edge Functions → new-post-push → Test / Invoke**에서 아래 body와 같은 Secret Header로 재시도할 수 있습니다. 호출 도구에서 실제 Secret을 공개하지 마세요.

```json
{"type":"INSERT","schema":"public","table":"team_art_posts","record":{"id":"실제-게시글-UUID"}}
```

`push_event_deliveries.sent_at`이 있는 이벤트/구독은 재시도에서 제외됩니다. 댓글마다 별도 이벤트 ID를 사용하므로 같은 글의 두 번째 댓글도 정상적으로 알립니다. 댓글을 재시도할 때는 위 JSON의 table을 `team_art_comments`로, record.id를 실제 댓글 UUID로 지정합니다. 처리 중 임대는 3분 후 재시도할 수 있습니다. 푸시 서비스가 수락한 직후 함수가 중단되면 드물게 재전송될 수 있으며 Worker의 이벤트별 notification tag가 중복 표시를 줄입니다. 성공 응답은 푸시 서비스의 수락을 의미하며 실제 기기 표시/정확한 도착 시각을 보장하는 영수증은 아닙니다.

로그아웃/사이트 닫기만으로 구독을 해제하지 않습니다. 더 이상 알림을 원하지 않으면 그 기기의 `알림 해제`를 누릅니다. 다른 계정으로 같은 기기에서 신청하면 기존 브라우저 endpoint를 폐기하고 새로 발급합니다. 오래된 endpoint는 다음 발송의 404/410 응답으로 정리됩니다. 로그인 사용자를 삭제하면 관련 구독도 DB에서 삭제됩니다.

## 비용 / 범위

상시 실행 서버나 추가 유료 서비스 없이 브라우저 표준 Push + 기존 GitHub Pages + Supabase Edge Functions/DB Webhooks로 동작합니다. **Supabase Free 플랜 한도 안에서 월 고정비 0원**을 목표로 합니다. 플랜별 함수 호출/DB/네트워크 한도와 무료 프로젝트 일시 중지는 Dashboard Usage와 공식 가격표에서 확인하세요. 브라우저/OS 설정, 네트워크, 배터리 정책 때문에 알림이 지연될 수 있습니다.

발송은 6개씩 동시 실행, 20개 행씩 커서 페이징하며 95초 이후 새 페이지 처리를 멈춥니다. 개인/소규모 구독자를 위한 구현입니다. 구독자가 크게 늘어나거나 자동 재시도를 보장해야 한다면 별도 Supabase 내부 durable queue/cron 분할 발송을 설계해야 합니다. 유료 서비스가 필수라는 의미는 아닙니다.

참고:

- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase 함수 실행 한도](https://supabase.com/docs/guides/functions/limits)
- [Supabase 가격/Free 한도](https://supabase.com/pricing)
- [WebKit iOS/iPadOS 홈 화면 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web-push 라이브러리](https://github.com/web-push-libs/web-push)


### ? ?? ??? ??? ??

`migration_team_freeze.sql` ?? ? `migration_push_team_freeze_compat.sql`? ????
`new-post-push`, `discord-posts`? ????. ??? ? ?? ?? ??? ????,
?? ?? ??? ??? ??? ????. ??? ?? ?? ??? ?? ? ??? Discord? ???? ???.
??? ??? ? ?? ?? ???? ???? ???. ??? ?? ?? ? ??? ????.
??? ???? ??? ??? ?? ?? ????? ?? ???? ??.
