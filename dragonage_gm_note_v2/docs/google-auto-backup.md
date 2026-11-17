# Google Drive와 Sheets 자동 백업

현재는 **로컬 구현과 모의 테스트 완료, 운영 적용 전**입니다. Google에 실제 백업 파일이나 시트를 생성하지 않았으며 운영 데이터의 백업 완료를 확인하지 않았습니다. 현재 도구에서는 Google 계정 쓰기 연결이 없고 Supabase 읽기 요청도 네트워크 오류로 끝났습니다. 아래 서버 설정을 적용한 뒤 대기열과 실제 변경으로 확인해야 합니다.

## 보관 내용

- 기존 게시글·댓글·캐릭터·팀·갤러리·NPC를 포함한 모든 기존 public 일반 테이블의 행을 최초에 백업합니다. 이후 INSERT/UPDATE/DELETE를 트랜잭션 안의 대기열에 기록합니다. 변경 전/후를 함께 보관하고 삭제 기록을 지우지 않습니다.
- **campaign-assets, post-images, free-board-images뿐 아니라 storage.objects에 등록된 모든 버킷·하위 경로의 실제 원본 파일**을 최초 복사합니다. 참조되지 않는 예전 이미지도 포함합니다. Storage 버킷 설정도 기록합니다.
- 신규 Google Drive 이미지도 공개 thumbnail이 아닌 **실제 원본 Blob**을 비공개 백업 폴더에 복사합니다. 원래 이미지와 Supabase 원본은 삭제하지 않습니다. 사이트의 기존 주소와 데이터는 그대로 유지합니다.
- 인증의 auth.users/identities는 암호화된 기록으로 백업합니다. 비밀번호·PIN 해시·키는 Sheets에 표시하지 않습니다. 원본 전체 행은 AES-256-GCM 암호화 JSON에 남습니다.
- Sheets에는 캐릭터·게시글·댓글·갤러리 등의 현재 상태와 변경 이력, 파일 대응표가 생성됩니다. 삭제된 행은 '삭제' 상태로 내용과 복구 링크를 유지합니다. Sheets에서 수동으로 편집한 내용은 사이트로 역전송되지 않습니다.
- 전체 PostgreSQL 덤프(스키마/함수/RLS/관리 스키마 등)는 기존 주간 암호화 백업을 계속 사용합니다. 이번 변경으로 그 암호화 파일도 Google Drive에 분할 업로드할 수 있습니다. 실시간 행 기록만으로 스키마·확장·모든 인증 설정을 재생성한다고 간주하지 마세요.

DB 변경 감지는 즉시 이루어지지만 Google 반영은 비동기입니다. 정상 시 대개 수초 후 반영되며, 최초 자료의 양·네트워크·Google 할당량에 따라 지연될 수 있습니다. 실패는 대기열에 남고 매분 재시도합니다. 최초 전체 복사 중에도 새 변경을 우선 처리하며, 오래된 초기 스냅샷이 최신 시트 값을 덮어쓰지 않습니다. 성공 이력·복사본을 자동 정리/삭제하는 기능은 없습니다.

## 적용 순서

### 1. 개인 설정 파일

프로젝트 루트에서 다음 명령을 실행합니다. 이미 이 작업에서 한 번 실행했으며 재실행해도 기존 비밀값을 덮어쓰지 않습니다.

```powershell
npm.cmd run backup:google:prepare
```

생성된 **`.google-backup.local.env`는 JSON 형식의 개인 복구 파일**입니다. Git에서 제외되어 있고 값은 채팅/콘솔에 출력하지 않습니다. VS Code에서 직접 열어 `GAS_WEB_APP_URL`의 빈 값에 **현재 정상 동작하는 기존 `/exec` 주소만** 넣으세요. 다른 값들은 자동 생성되어 있습니다. 기존 `.backup.local.env`의 백업 키가 있으면 같은 키를 사용합니다.

이 파일과 기존 `.backup.local.env`를 별도 안전한 장소에도 보관하세요. 복호화 키를 잃으면 인증 정보를 포함한 암호화 원본을 복구할 수 없습니다. 키 파일을 Google 백업 폴더나 공개 GitHub에 올리지 마세요.

### 2. 기존 Apps Script 수정

1. **기존 Code.gs 전체를** `data/drive-diagnostics/Code-with-backup.gs` 전체로 교체하세요. 이 파일에는 기존 이미지 업로드 코드와 새 백업 코드가 한 번씩 합쳐져 있습니다. **뒤에 추가 붙여넣기 하지 마세요.**
2. 예전에 별도로 만든 `Backup.gs`가 있다면, 한 파일로 합쳐 쓰는 경우 그 중복 정의를 제거하세요. 원본 개발용 파일 두 개를 유지하는 방식도 가능하지만 합친 파일과 동시에 두면 중복 상수 오류가 발생합니다.
3. 스크립트 속성에 **`BACKUP_SHARED_SECRET`**을 추가합니다. 값은 개인 설정 파일의 **`GAS_BACKUP_SHARED_SECRET` 값**을 그대로 복사합니다. 이미지 업로드용 `SHARED_SECRET`, `DRIVE_FOLDER_ID`는 현재 값으로 유지합니다.
4. 편집기에서 **`setupGoogleBackup`**을 선택하여 한 번 실행하고 Google 권한을 승인하세요. 기존 이미지 폴더와 분리된 **'GM-note 비공개 백업' 폴더와 'GM-note 자동 백업' 시트**가 생성됩니다. 실행 로그에 폴더/시트 링크만 표시됩니다. 비밀값은 표시하지 않습니다.
5. 자동 생성된 `BACKUP_FOLDER_ID`, `BACKUP_SPREADSHEET_ID`를 스크립트 속성에서 확인할 수 있습니다. 공개 이미지 폴더를 백업 폴더로 재사용하지 마세요. 코드가 공개 폴더/공개 시트를 감지하면 백업을 거부합니다.
6. **배포 → 배포 관리 → 기존 웹 앱 → 수정 → 새 버전**으로 업데이트합니다. 기존 `/exec` 주소를 유지합니다. `doPost`를 편집기에서 직접 실행하여 테스트하지 마세요.

백업은 별도 UserLock을 사용하므로 이미지 업로드의 ScriptLock과 분리됩니다. 새 코드도 기존 이미지 업로드의 인증/공개 링크 동작을 유지합니다.

### 3. 새 Supabase Edge Function

이름이 **`google-backup`인 새 함수**를 생성합니다. 기존 `drive-image-upload` 함수를 대체하지 않습니다.

- 대시보드 편집기 `index.ts` 전체에 **`data/drive-diagnostics/google-backup.paste.ts`**를 붙여넣고 배포합니다. 의존 모듈이 합쳐져 있어 별도 파일을 만들 필요가 없습니다.
- 또는 CLI: `npx.cmd supabase functions deploy google-backup`. 프로젝트의 `supabase/config.toml`에 이 함수만 `verify_jwt=false`가 설정되어 있습니다. 대시보드에서는 새 google-backup 함수의 기본 JWT 검사 옵션을 꺼야 합니다. 브라우저 JWT로 호출하는 이미지 업로드 함수의 설정은 유지하세요.
- 이 함수는 브라우저에서 호출하지 않습니다. DB의 시간 제한 HMAC 서명으로 인증합니다. 비밀값 자체를 pg_net 요청 헤더에 보내지 않습니다. 서명 없는 요청은 DB 접근 전에 거부됩니다.

Supabase **Secrets**에 개인 설정 파일과 같은 이름/값으로 추가하세요.

- `GAS_BACKUP_SHARED_SECRET`
- `GOOGLE_BACKUP_WEBHOOK_SECRET`
- `GOOGLE_BACKUP_ENCRYPTION_KEY`

기존 `GAS_WEB_APP_URL`은 그대로 사용합니다. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 기본 설정을 사용하며 프런트엔드에 넣지 않습니다.

### 4. Supabase Vault 두 항목

Vault에 다음 이름으로 값을 등록합니다. 실제 비밀값이 들어간 SQL을 프로젝트에 저장하지 마세요.

- **`gm_backup_edge_url`**: `https://프로젝트ID.supabase.co/functions/v1/google-backup`
- **`gm_backup_webhook_secret`**: 개인 설정 파일의 `GOOGLE_BACKUP_WEBHOOK_SECRET`과 같은 값

Vault의 URL은 Apps Script 주소가 아니라 **새 Edge Function 주소**입니다.

### 5. DB 최초 백업 및 자동 변경 감지 설치

SQL Editor에서 **`supabase/google_backup.sql` 전체**를 실행하세요. 기존 앱 테이블의 열·내용·RLS는 바꾸지 않습니다. 새로운 백업 전용 대기열/상태/소스 목록 테이블과 AFTER 트리거, service-role 전용 처리 함수, 재시도 cron을 추가합니다. 새 백업 테이블은 일반 사용자에게 읽기/쓰기 권한이 없습니다.

기존 테이블에 PK가 없거나 Supabase가 특정 관리 테이블 트리거 설치를 허용하지 않으면 전체 설치가 롤백됩니다. 오류를 무시하고 부분 적용하지 말고 해당 오류를 확인해야 합니다. 소스별 최초 스냅샷 여부가 기록되어 재실행 시 기존 전체 자료를 중복 수집하지 않습니다. 나중에 public 테이블을 추가하면 이 SQL을 다시 실행하여 그 테이블도 등록하세요. 현재 코드는 일반 테이블 대상이며 partitioned table이나 DDL 변경의 자동 백업은 전체 DB 덤프가 담당합니다.

이 단계부터 기존 자료와 파일을 순차적으로 복사합니다. **대기열 등록은 Google 백업 성공을 뜻하지 않습니다.** 모든 자료가 즉시 복사되었다고 간주하지 마세요. 최초 복사가 끝날 때까지 원본을 보존하세요.

## 완료 확인

### 기존 설치에서 이미지 먼저 복사하기

초기 버전은 테이블 이름순으로 수집하여 app_activity_logs가 Storage 원본보다 먼저 처리됐습니다. JSON만 먼저 보이는 경우가 있으며 이미지 백업 성공을 뜻하지 않습니다. 최신 `Code-with-backup.gs`로 Apps Script를 업데이트해 동일한 원본의 재사용을 적용한 뒤, SQL Editor에서 `supabase/google_backup_prioritize_images.sql`을 한 번 실행하면 기존 대기열을 지우지 않고 **새 변경 → 기존 이미지 원본 → 글·댓글·캐릭터 → 나머지 자료 → 활동 이력** 순서로 처리합니다. 기존 비밀값·폴더 설정은 유지합니다. 이미지 파일과 portable manifest는 `assets`, 암호화 행 기록은 `records`에 저장됩니다.

프로젝트 루트의 `npm.cmd run backup:google:status`는 Apps Script 설정과 폴더/시트 접근만 확인합니다. 전체 자료의 백업 완료 검사는 아래와 같이 합니다.

1. SQL Editor에서 **`supabase/google_backup_status.sql`**을 실행합니다. `pending=0`, `last_success` 및 테이블별 결과를 확인하세요. 오류가 있으면 `last_error_code`만 확인하며 payload나 Vault 비밀값을 채팅에 보내지 마세요.
2. 시트에서 실제 기존 글/댓글/캐릭터와 파일목록을 확인합니다. Drive의 `assets` 폴더에는 버킷 전체 원본 및 `.manifest.json` 대응표가 있어야 합니다. Google Drive의 파일 설명에만 대응표를 의존하지 않습니다.
3. 사이트에서 테스트 글을 생성 → 수정 → 삭제합니다. 시트의 현재 상태/삭제 표시와 변경 이력, `records`의 암호화 JSON이 모두 생기는지 확인합니다. 토큰/게시글 이미지도 원본 복사본 링크를 열어 확인합니다.
4. Google 계정/할당량 오류, 원본 파일 유실, 서명 만료, 공개 백업 폴더 설정 등은 성공으로 처리하지 않습니다. 실패한 이벤트는 원본 DB 대기열에 남습니다. 원본 파일을 이미 삭제했고 사본도 없다면 복사할 수 없으므로 `BACKUP_ASSET_MISSING`을 해소해야 합니다. 이벤트 자체의 암호화 기록은 먼저 저장되지만 첨부 복사까지 끝나야 완료 처리합니다.

Apps Script의 실행 시간/일일 UrlFetch·Drive·Sheets 할당량과 Google 저장 공간에 영향을 받습니다. 특히 최초 백업은 모든 기존 행/파일을 포함하므로 오래 걸릴 수 있습니다. Google이 잠시 막혀도 변경 이벤트는 DB에 남지만, Google 반영 전에 **DB와 원본 파일이 동시에 소실되는 경우까지 무손실을 보장하지는 않습니다.**

## 전체 PostgreSQL 덤프도 Google에 보관

기존 비공개 백업 저장소 `legavin1023/dragonage-trpg-backups`에 다음 변경을 반영해야 합니다. 이 작업에서는 해당 저장소를 push하거나 Actions 설정을 변경하지 않았습니다.

1. 로컬 `backup/google/transport.mjs`, `backup/google/upload.mjs`를 비공개 저장소의 **`google/` 폴더**로 복사합니다.
2. 로컬 **`backup/weekly-backup.yml`**을 비공개 저장소의 **`.github/workflows/weekly-backup.yml`**에 반영합니다.
3. 그 비공개 저장소 Actions Secrets에 **`GAS_WEB_APP_URL`, `GAS_BACKUP_SHARED_SECRET`**을 등록합니다. 기존 DB 백업 Secrets는 그대로 유지합니다.
4. Actions의 **Weekly full encrypted backup → Run workflow**를 실행하여 최초 전체 덤프도 지금 보관합니다. 기존 월요일 04:17 한국 시간 일정은 유지됩니다.

기존 암호화 전체 백업은 4MB 조각으로 Google Drive의 `snapshots`에 저장됩니다. 모든 조각의 크기/SHA-256을 확인한 뒤 `.manifest.json` 완료 파일을 만듭니다. 실패한 조각은 같은 snapshot ID로 재실행할 때 재사용됩니다. Google 업로드가 실패해도 기존 GitHub Artifact 업로드를 먼저 보존한 후 workflow 실패를 알립니다. 기존 95MB 백업 상한은 그대로이므로 상한에 걸리면 기존 백업 크기 설정도 별도로 조정해야 합니다.

이미 내려받은 `dragonage.backup.enc`가 있으면 다음 명령으로 지금 Google에 복사할 수도 있습니다.

```powershell
node backup/google/upload.mjs backup-output/dragonage.backup.enc --config .google-backup.local.env
```

## 나중에 복구하기

운영 DB를 바로 덮어쓰지 말고 별도 테스트 프로젝트에서 먼저 복원하세요. 이 작업에서는 실제 Supabase 전체 복원 테스트를 수행하지 않았습니다.

1. Google 백업 폴더를 다운로드하고 별도 보관한 복구 키를 준비합니다.
2. **전체 DB 스냅샷**의 manifest와 같은 디렉터리에 모든 part 파일을 둡니다.

```powershell
node backup/google/recover.mjs snapshot 내려받은폴더/snapshot-해시.manifest.json backup-output/restored.enc
```

조각과 전체 SHA-256 검증 후 암호화 파일이 재조합됩니다. 이어 기존 `backup/restore.mjs`, `backup/verify.mjs`를 사용해 복호화·아카이브 내부 검증을 하고 [주간 백업 복구 절차](weekly-backup.md)에 따라 테스트 DB에 선택 복원합니다. Supabase 관리 스키마와 이미 존재하는 역할/확장을 무조건 덮어쓰거나 `--clean`을 자동 실행하지 않습니다. Vault·서버 Secrets·사이트 URL/키도 복구 파일과 별도로 확인하세요.

3. **최신 변경 기록**은 `records` 폴더의 암호화 JSON을 다음 명령으로 검증·복호화합니다. 프로젝트 루트의 개인 설정 파일에서 키를 읽고, 기존 결과를 덮어쓰지 않습니다.

```powershell
node backup/google/recover.mjs events 내려받은폴더/records backup/google/output/recovered
node backup/google/recover.mjs assets 내려받은폴더/assets
```

`latest-rows.json`에는 원래 schema/table/PK와 최신 행, 삭제 표시가 복원됩니다. 전체 DB 스냅샷과 대조하여 이후 변경을 반영할 수 있는 원본이며 **운영 DB에 자동 실행되지 않습니다**. 전체 스냅샷 이후의 모든 이벤트가 Google에 도착했는지, 복원한 schema 및 제약과 맞는지는 별도로 확인해야 합니다. 중간 기록이 누락되었다면 도구가 모든 누락을 독립적으로 증명할 수는 없으므로 운영 대기열 완료 확인도 중요합니다.

`assets`의 portable manifest에는 원본 `storage/버킷/경로` 또는 `drive/원본ID`와 사본 파일명·크기·SHA-256이 남습니다. Supabase 파일은 기존 버킷/경로로 다시 업로드하고, Drive 원본이 없어졌다면 복구용 사본에서 공개 이미지용 폴더에 새 파일을 만들어 **새 ID와 DB 참조를 연결**해야 합니다. Drive ID는 복사로 동일하게 재생성할 수 없습니다. 비공개 백업 자체를 공개로 바꾸지 마세요.

로컬 복호화 결과에는 인증 정보를 포함한 민감 데이터가 있으므로 git에서 제외된 지정 출력 폴더에만 보관하세요. Google Sheets의 보이는 열만 내보낸 CSV로 전체 DB를 복원하려고 하지 마세요. 긴 본문은 표시상 줄어들 수 있고 인증 정보는 의도적으로 가려져 있으며, 원문은 암호화 JSON에 있습니다.

공식 참고: [Supabase DB 백업에는 Storage 파일 원문이 포함되지 않음](https://supabase.com/docs/guides/platform/backups), [비동기 Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [Apps Script 할당량](https://developers.google.com/apps-script/guides/services/quotas).


폴더 분류와 최근 3일 변경 이력 보관은 [별도 적용 안내](google-backup-folders.md)를 참조하세요. 원본·최신 사본·전체 복구 기준본은 자동 삭제하지 않습니다.
