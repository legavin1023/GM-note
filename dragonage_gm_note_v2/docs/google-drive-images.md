# GM-note 이미지 저장소 적용 및 복구

현재 상태: 로컬 구현과 모의 테스트를 완료했습니다. 운영 Edge/GAS의 배포 버전, 비밀값 일치, 폴더 권한, 실제 업로드 및 브라우저 표시는 아직 확인하지 못했습니다. CLI 및 Endpoint 진단은 네트워크 연결 오류로 끝났습니다. 기존 Storage 원본과 운영 DB에는 변경을 실행하지 않았습니다.

## 확인한 호출 흐름과 오류

`Vue → Supabase Auth JWT → drive-image-upload → GAS /exec POST → ContentService GET redirect → Drive → JSON → Vue`.

전달받은 이전 Edge 코드에서는 `서버 처리 중 오류가 발생했습니다.`가 외부 catch의 **500** 응답에만 존재합니다. GAS의 `ok:false`는 별도로 **502**에 매핑됩니다. 같은 문구가 실제로 502로 관찰되었다면 실행된 배포 코드 또는 응답을 추가 확인해야 합니다. 코드만 보고 실제 원인을 단정할 수 없습니다.

기존 GAS는 실패를 catch하여 HTTP 200 JSON으로 반환하므로 실행 기록의 '완료됨'만으로 저장 성공을 판단할 수 없습니다. 이전 코드는 설정 누락과 비밀값 불일치를 모두 '인증 실패'로 합쳤습니다. 프런트엔드는 FunctionsHttpError의 응답 JSON을 읽지 않아 원인을 숨겼습니다. Edge의 `redirect:follow` 자체는 정상적인 ContentService 처리 방식이며 502 원인으로 단정하지 않았습니다. 새 코드는 첫 응답 상태를 기록하고 Google의 ContentService 리디렉션만 GET으로 따라갑니다.

새 로그는 `requestId`, `stage`, `code`, `version`, HTTP 상태만 기록합니다. JWT, 요청 본문, 폴더 ID, 공유 비밀값, 리디렉션의 일회용 URL, 원시 예외는 기록하지 않습니다. 화면의 요청 ID로 Edge 로그와 GAS 실행 로그를 연결하세요.

프로토콜 확인에 사용한 공식 문서: [Google ContentService 리디렉션](https://developers.google.com/apps-script/guides/content), [Supabase getUser의 서버 인증 검증](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase JWT와 RLS 연동](https://supabase.com/docs/guides/functions/auth-legacy-jwt).

## 1. 기존 Apps Script 프로젝트 적용

1. 기존 프로젝트의 **Code.gs 전체**를 [`../google-apps-script/Code.gs`](../google-apps-script/Code.gs) 내용으로 교체하고 저장합니다. 새 프로젝트를 만들 필요가 없습니다.
2. **프로젝트 설정 → 스크립트 속성**에서 `SHARED_SECRET`, `DRIVE_FOLDER_ID`가 있는지 확인합니다. 폴더 ID는 폴더 URL의 ID 부분입니다. 비밀값 앞뒤 공백도 값에 포함되므로 임의로 trim하지 않습니다.
3. 실행할 함수로 `authorizeDrive`를 선택하여 해당 Google 계정으로 한 번 실행하고 필요한 Drive 권한을 승인합니다. 이 함수의 성공은 **폴더 읽기 권한만** 확인합니다. 파일 생성과 공개 공유 권한은 실제 업로드로 확인해야 합니다.
4. **배포 → 배포 관리 → 기존 웹 앱 배포 선택 → 수정(연필) → 버전 '새 버전' → 배포**합니다. **새 배포 만들기 대신 기존 배포를 수정하여 `/exec` URL을 유지**합니다.
5. 웹 앱의 실행 계정은 폴더를 쓸 수 있는 배포자 계정이어야 합니다. 서버 호출이 Google 로그인 화면으로 이동하지 않도록 해당 웹 앱 접근 설정을 확인하세요. 공유 비밀값은 모든 변경 요청에서 서버가 검증합니다. 조직의 공개 공유 정책에 막히면 `GAS_SHARE`가 발생합니다.
6. `/exec`를 GET으로 열면 `{ok:true,version:"gm-drive-2026-11-11"}`가 반환되어야 합니다. 이는 배포 코드 확인용이며 업로드 성공 증거는 아닙니다. `/dev` 주소는 사용하지 않습니다.

## 2. Supabase 적용

1. SQL Editor에서 [`../supabase/drive_image_reference_check.sql`](../supabase/drive_image_reference_check.sql)을 실행합니다. 파일 삭제 전에 모든 public 테이블의 문자열·배열·JSON 참조를 검사하는 service-role 전용 함수만 추가합니다. 기존 테이블/행/RLS는 변경하지 않습니다. 업로드에는 이 함수가 사용되지 않습니다.
2. **Edge Functions → Secrets**에서 다음 항목을 확인합니다. 값은 채팅·GitHub·프런트엔드에 넣지 마세요.
   - `GAS_WEB_APP_URL`: 위에서 유지한 기존 `/exec` 주소.
   - `GAS_SHARED_SECRET`: Apps Script의 `SHARED_SECRET`과 **정확히 같은 값**.
   - `SUPABASE_URL`, Supabase 공개 API 키: 기본 제공 설정을 사용합니다.
   - `SUPABASE_SERVICE_ROLE_KEY`: 기본 제공 서버 설정. 삭제 시 참조 검사에만 사용하며 브라우저에 전달하지 않습니다.
3. `npm.cmd run drive:prepare`를 실행합니다. 생성된 **`data/drive-diagnostics/drive-image-upload.paste.ts` 전체**를 대시보드의 **drive-image-upload → Code → index.ts 전체**에 붙여넣고 배포할 수 있습니다. 이 파일은 두 소스 모듈을 합친 것으로 별도 import 파일 추가가 필요 없습니다. 실제 비밀값은 포함하지 않습니다.
4. CLI로 배포한다면 프로젝트 루트에서 `npx.cmd supabase functions deploy drive-image-upload`를 사용합니다. [`../supabase/functions/drive-image-upload/index.ts`](../supabase/functions/drive-image-upload/index.ts)와 같은 폴더의 `protocol.mjs`가 함께 배포됩니다.
5. 기존 JWT 검증 설정을 임의로 끄지 마세요. 함수 본문에서도 `auth.getUser(token)`으로 사용자 JWT를 검증하고, 요청자의 JWT를 Supabase client에 전달하여 RLS와 기존 `current_session_is_active`, `current_user_is_gm`, `player_character_context`를 사용합니다. 본문에 `isGM:true`를 넣어도 권한을 얻을 수 없습니다. `PERMISSION_CONFIG`가 발생하면 기존 프로젝트의 해당 함수 배포 상태를 확인하세요. 서비스 키로 일반 업로드 권한을 우회하지 않습니다.

오류별 확인 위치:

- `EDGE_CONFIG`: 해당 이름의 서버 설정 누락 또는 올바르지 않은 `/exec` URL.
- `AUTH_REQUIRED`, `AUTH_INVALID`: Supabase 로그인/JWT. GAS 비밀값과는 별개입니다.
- `GAS_CONFIG`: GAS 스크립트 속성 누락.
- `GAS_AUTH`: Edge와 GAS의 공유 비밀값 불일치.
- `GAS_REDIRECT`, `GAS_NOT_JSON`: Google 로그인/접근 제한/잘못된 웹 앱 배포 또는 HTML 응답.
- `GAS_FOLDER`, `GAS_CREATE`, `GAS_SHARE`: 폴더 접근, 파일 생성, 공개 공유 단계 중 해당 단계 실패.
- `GAS_VERSION`: 기존 배포가 새 코드 버전을 가리키지 않음.
- `GAS_HTTP`, `GAS_NETWORK`, `GAS_TIMEOUT`: 상위 HTTP 또는 네트워크 실패. 타임아웃 후 무조건 새 업로드를 만들지 말고 같은 파일로 재시도합니다. 작업 ID가 유지되어 중복 생성이 방지됩니다.
- `REFERENCE_CHECK`: 삭제 검사 SQL 미적용 등. 파일은 보존됩니다.

## 3. 실제 업로드 및 브라우저 확인

GAS → Edge → Vue 순서로 적용합니다. 프런트엔드 빌드/Pages 배포는 서버 준비 후 진행하세요.

1. 기존 로그인으로 갤러리, 캐릭터 토큰, NPC 토큰, 팀 작품 게시글, 댓글에 작은 PNG를 업로드합니다. JPEG/WebP/GIF도 각각 확인합니다. 파일당 10MB이며 빈 파일과 비이미지 파일은 거부됩니다. 게시글 본문·기존 UI는 변경하지 않았습니다.
2. 저장한 뒤 페이지를 새로 고쳐 DB에 기록된 Drive URL로 다시 표시되는지 확인합니다. 로그인하지 않은 Google 계정 환경에서도 이미지가 표시되는지 확인합니다. Google Drive thumbnail은 CDN이 아니므로 일시 제한이나 브라우저 차단이 있을 수 있습니다. Network의 이미지 요청이 200인 것과 실제 `<img>`의 `naturalWidth > 0`을 모두 확인하세요. HTTP 200 HTML은 이미지 성공이 아닙니다.
3. 토큰 교체 후 캐릭터의 현재 URL과 갤러리의 기존 토큰 이력이 유지되는지 확인합니다. 갤러리 항목을 삭제해도 현재 캐릭터가 참조하는 파일은 보존되어야 합니다. 다른 DB 참조가 없는 신규 Drive 파일만 휴지통으로 이동합니다. 이전 GAS로 생성되어 소유 메타데이터가 없는 파일은 자동 삭제하지 않습니다.
4. 댓글·게시글 삭제 시 연결된 DB 행의 RLS 검증 후 첨부파일 정리를 시도합니다. 파일 정리 실패는 오류로 표시하며 원본은 복구 가능하도록 Drive 휴지통 방식을 사용합니다. 비활성 사용자, 로그인하지 않은 요청, 다른 팀 플레이어, 위조된 GM 플래그가 변경 권한을 얻지 못하는지 확인합니다.
5. 기존 Supabase 공개 URL과 private Storage 경로도 계속 표시되어야 합니다. FreeBoardView, TeamArtPreview, HomeDashboardView, CharacterTaggedPostsPanel은 URL을 그대로 사용하고 기존 경로에는 signed URL 및 post-images 폴백을 사용합니다.

선택적인 CLI 진단(개인 로컬 환경에서만): `DRIVE_TEST_ACCESS_TOKEN`에 **현재 GM 로그인 세션의 access token**을 임시 환경변수로 설정하고 `node --env-file=.env scripts/diagnose-drive.mjs`를 실행합니다. 설정·폴더 읽기만 검사합니다. `--upload-test`를 추가하면 작은 PNG를 실제 업로드하고 결과를 git에서 제외된 `data/drive-diagnostics/upload-result.json`에 저장합니다. 자동 삭제하지 않습니다. 테스트 토큰을 파일/로그/채팅에 저장하지 마세요. 이 CLI 성공도 실제 브라우저 렌더링 검증을 대신하지 않습니다.

## 4. 기존 Storage 이전

스크립트: [`../scripts/drive-migration/migrate.mjs`](../scripts/drive-migration/migrate.mjs). `campaign-assets`, `post-images`, `free-board-images`의 **storage.objects 전체 목록**을 직접 조회하므로 폴더 재귀 및 API 페이지네이션으로 누락되지 않습니다. 이미지가 아닌 파일도 원본 백업에는 포함합니다. 경로는 manifest와 대응표에 완전히 보존하며, Drive 저장 파일명은 재시도 중복 방지를 위한 안정적인 이름을 사용합니다. Drive 폴더는 평탄하게 저장됩니다.

준비:

- 기존 주간 암호화 백업도 실행하여 별도로 보관하세요([weekly-backup.md](weekly-backup.md)). 본 도구의 database.json은 public 테이블의 데이터 논리 백업이며 전체 PostgreSQL 스키마/Auth/권한 백업을 대체하지 않습니다.
- 이전 중에는 사이트 사용자의 글 작성·이미지 변경을 멈춘 유지보수 시간을 잡습니다. 스크립트는 Storage 목록 변경과 변경 대상 셀의 충돌을 감지하면 중단합니다.
- `npm.cmd ci --prefix backup`으로 기존 backup 도구의 고정된 `pg` 의존성을 설치합니다.
- `scripts/drive-migration/.env.example`의 **변수 이름만 참고**하여 환경변수를 설정합니다. 실제 값은 추적되지 않는 개인 파일에 저장하고 Node의 `--env-file=개인파일`로 읽을 수 있습니다. `MIGRATION_DATABASE_URL`은 storage/public 전체 읽기와 대상 참조 수정이 가능한 직접 또는 session pooler PostgreSQL 연결이며 TLS 검증을 사용합니다. `MIGRATION_GM_USER_ID`는 기존 GM의 Supabase Auth UUID입니다. `SUPABASE_SERVICE_ROLE_KEY`는 원본 다운로드에 사용합니다.
- `data/drive-migration/`에는 캐릭터/게시글 등의 비공개 데이터가 저장됩니다. git에서 제외되어 있지만 로컬 보관 권한과 별도 암호화 백업은 관리자가 관리해야 합니다. 실제 값이 든 파일을 커밋하지 마세요.

각 명령은 프로젝트 루트에서 실행합니다(개인 env 파일을 쓴다면 각 node 명령에 `--env-file=...`을 추가).

```powershell
node scripts/drive-migration/migrate.mjs inventory
node scripts/drive-migration/migrate.mjs backup
node scripts/drive-migration/migrate.mjs copy
node scripts/drive-migration/migrate.mjs verify-files
node scripts/drive-migration/migrate.mjs plan
```

`inventory.json`에는 세 버킷의 모든 객체·경로·갱신 시각이 기록됩니다. `originals/<object-id>.bin`과 `backup.json`에 전체 원본과 SHA-256이 기록되며, `database.json`에 public 테이블의 모든 행이 저장됩니다. 완료된 원본 백업은 재실행으로 덮어쓸 수 없습니다. 새 백업이 필요하면 기존 디렉터리를 **개인 보관 장소로 별도 보존**한 뒤 새로 시작합니다.

`mapping.json`이 `bucket/path → Drive ID/URL/SHA-256/status` 대응표입니다. `copy`를 다시 실행하면 성공한 파일은 건너뛰고 실패/미완료 항목만 재시도합니다. 응답이 유실돼도 같은 작업 ID로 GAS 파일을 재사용합니다. 10MB 초과 이미지나 지원하지 않는 이미지 형식은 실패 항목으로 남기며, 모든 이미지가 복사되기 전에는 계획 단계가 진행되지 않습니다. 자동 변환이나 원본 삭제는 없습니다.

`plan.json`의 이전/새 참조와 변경 대상 행을 검토하세요. public의 text/varchar, 배열, JSON 및 본문 안의 Storage URL까지 검사합니다. 외부 도메인의 이미지는 변경하지 않습니다. 테이블 PK가 없는 변경 대상은 중단합니다. 두 버킷에 같은 상대 경로가 존재해 출처가 모호하면 추측하지 않고 중단합니다. `overrides.json`에 다음처럼 명시한 뒤 plan을 다시 실행하세요.

```json
{
  "team_art_posts.image_paths:사용자/posts/게시글/파일.png": "free-board-images/사용자/posts/게시글/파일.png"
}
```

`verify-files`는 DB 변경 전에 Drive 원본의 실제 SHA-256/크기 및 공개 이미지 HTTP 응답을 검사하고 `file-verification.json`을 만듭니다. 실패가 있거나 mapping이 바뀌면 apply가 차단됩니다. 복사 재시도 후 이 검증도 다시 실행하세요.

검토 후:

```powershell
node scripts/drive-migration/migrate.mjs apply --execute
node scripts/drive-migration/migrate.mjs verify
```

apply는 백업 SHA-256과 원본 파일을 다시 검증하고 DB 트랜잭션에서 대상 테이블을 잠근 뒤, 셀이 백업과 같은지 확인합니다. `apply-journal.json`을 디스크에 저장한 후 **이미지 참조 필드만** 변경합니다. 트리거가 대상 값을 변형하면 commit 전에 검증하여 전체 rollback합니다. 다른 사용자 수정과 충돌하면 덮어쓰지 않고 중단합니다. 관리 작업으로도 기존 트리거/제약은 비활성화하지 않습니다.

verify는 원본 Storage 목록/백업, 실제 Drive 원본의 SHA-256/크기/휴지통 상태, 공개 thumbnail의 이미지 HTTP 응답, DB에 남은 이전 참조를 검사합니다. `verification.json`에서 실패·남은 참조를 확인하세요. 이 결과의 `browserRenderingVerified`는 자동으로 true가 되지 않습니다. 실제 사이트에서 위 브라우저 확인을 수행해야 완료입니다.

롤백:

```powershell
node scripts/drive-migration/migrate.mjs rollback --execute
```

현재 참조가 적용 직후 값과 같은지 검사한 뒤 트랜잭션으로 이전 이미지 참조를 복구합니다. 이후 다른 수정이 있었다면 충돌로 중단하여 덮어쓰기를 막습니다. 이 롤백은 변경한 이미지 참조를 복구하며 트리거가 생성한 활동 로그/updated_at까지 과거로 되돌리는 전체 DB 복구는 아닙니다. 전체 복구에는 별도 보관한 DB 백업을 사용하세요. Drive 복사본과 Supabase 원본은 롤백에서도 삭제하지 않습니다.

## 5. 검증 및 Pages 배포 준비

```powershell
npm.cmd run test:drive
node --test tests/*.test.mjs tests/*.test.cjs
npm.cmd run build
```

로컬 테스트는 GAS/Edge에 모의 의존성을 넣어 프로토콜과 인증·권한·실패 경로를 검증합니다. Deno 타입 검사, 실제 Google 계정/Drive, 운영 PostgreSQL 트랜잭션 및 브라우저 표시는 별도 환경 검증이 필요합니다. 기존 `publicPath`는 `/GM-note/`로 유지했습니다. 서버 적용과 실제 업로드 QA가 끝난 뒤 기존 `npm.cmd run deploy` 절차로 GitHub Pages에 배포하세요. 이 작업에서는 push/Pages 배포를 실행하지 않았습니다.

추가 발견: 기존 `.env.example`의 실제 자격증명 형태 값을 예시 자리표시자로 교체했습니다. 실제 사용 중이던 웹훅이라면 기존 노출 여부를 확인하고 해당 서비스에서 재발급하세요. 비밀값은 문서/코드에 재기록하지 않았습니다.
