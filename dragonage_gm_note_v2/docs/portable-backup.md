# Supabase를 떠날 때 필요한 이관용 백업

현재 Google 실시간 백업은 행/변경 이력과 원본 파일을 보관합니다. 이 자료만으로 테이블 관계, SQL 함수, RLS와 권한, 인증/API 서버까지 재생성된다고 간주할 수 없습니다.

`backup/export-portable.mjs`는 기존 읽기 전용 백업 설정과 PostgreSQL 도구로 다음을 하나의 암호화 파일에 묶습니다.

- `database.dump`: 일관된 스냅샷의 DB 구조 및 데이터 전체.
- `schema.sql`: 같은 덤프에서 추출한 테이블, PK/FK, 인덱스, 뷰, 함수, 트리거, RLS 및 권한.
- `roles.sql`: DB 역할과 멤버십. 역할 비밀번호 제외.
- `source/`: 내보낸 시점의 사이트/Edge/Apps Script 소스와 미커밋 변경. Git에서 제외된 파일과 실제 env 파일 제외.
- `recovery-settings.json`: 로컬 환경·복구 설정을 암호화 내부에 보관. 운영 Dashboard에서 수동 변경한 최신 Secrets와 일치 여부는 미검증.
- `manifest.json`, `database-contents.txt`, `RESTORE.md`: SHA-256, 복구 목록, 복원 시 주의점.

`--with-assets`를 지정하면 `assets/`에 Storage 전체 원본과 DB 덤프에서 발견한 공개 Google Drive 이미지도 넣습니다. `asset-manifest.json`에는 원래 버킷·경로, Drive 파일 ID, 보관 파일명, 크기, SHA-256 대응표가 들어갑니다. 지정하지 않으면 DB·소스·설정만 보관하며 이미지 원본은 별도로 보관해야 합니다. 일반적인 PostgreSQL 덤프에는 Storage 바이너리가 포함되지 않습니다.

## 실행 준비

이 PC에는 PostgreSQL 18 도구가 있습니다. 기존 `.backup.local.env`의 읽기 전용 연결/암호화 키를 사용합니다. 다른 PC에서는 `PORTABLE_PG_BIN`을 PostgreSQL 도구 경로로 지정하세요. 비밀번호와 연결 URL을 콘솔에 출력하지 않습니다.

사용자가 제공한 Supabase CA 인증서로 `verify-full` 연결과 실제 DB·소스 보관본 생성을 확인했습니다. 각 실행의 완성 여부는 해당 폴더의 `export-status.json`으로 확인하세요. 실패한 실행의 빈 폴더는 완성된 보관본이 아닙니다.

2026-11-11 완성본: `backup-output/migration-2026-11-11T10-53-08-073Z/gm-note-portable.enc`. 독립 복호화·압축 해제 검증에서 소스 203개, Storage 원본 182개(122,806,952바이트), 체크섬 392개가 일치했습니다. 덤프 데이터 항목 91개와 RLS 활성화 설정 67개를 확인했습니다. 이 덤프에서 발견한 공개 Drive 이미지 참조는 0개였습니다. 검증 결과는 같은 폴더의 `verification.json`에 있습니다.

Supabase Dashboard의 **Database Settings → SSL Configuration → Download Certificate**에서 프로젝트 CA를 내려받아 프로젝트 루트에 `prod-ca-2021.crt`로 두세요. 다른 파일명/경로라면 `PORTABLE_DB_CA_FILE` 환경변수로 지정할 수 있습니다. 서버 인증서와 호스트명 검증(`verify-full`)을 유지합니다. CA 파일에는 일반적으로 비밀번호/개인키가 없지만, Dashboard에서 내려받은 신뢰할 수 있는 인증서를 사용해야 합니다.

```powershell
$env:PORTABLE_DB_CA_FILE = "$env:USERPROFILE\Downloads\prod-ca-2021.crt"
node --use-system-ca --use-env-proxy backup/export-portable.mjs --with-assets
```

성공한 경우에만 `backup-output/migration-실행시각/gm-note-portable.enc`와 `export-status.json`이 만들어집니다. 파일은 Git에서 제외됩니다. 임시 평문은 OS 임시 폴더에서 처리하고 종료 시 해당 실행의 임시 폴더만 정리합니다.

내보내기는 실제 DB를 변경하지 않습니다. 동일 덤프에서 구조를 추출하고, PostgreSQL 복구 목록 조회, 암호화/복호화 왕복, 원본 아카이브 해시 일치를 검사합니다. 원본 파일은 크기와 SHA-256을 확인하고 저장 후 다시 읽어 검증합니다. 다운로드 전후 Storage 목록·메타데이터가 달라지면 성공으로 기록하지 않습니다. **새 DB에 실제 전체 복원하거나 사이트 로그인을 시험한 것은 아닙니다.**

완성본을 다시 검증하려면 프로젝트 루트에서 다음을 실행합니다. 로컬 `.backup.local.env`의 키를 사용하며 콘솔에 비밀값을 출력하지 않습니다. OS 임시 폴더에 해독·압축 해제한 다음 모든 내부 체크섬과 DB 덤프 목록을 검증하고 임시 평문을 정리합니다.

```powershell
node backup/verify-portable.mjs backup-output/migration-2026-11-11T10-53-08-073Z/gm-note-portable.enc
```

이미지를 포함하면 파일을 내려받는 만큼 Supabase 전송량이 사용됩니다. 원본 파일 다운로드 한도는 기본 200 MiB이며 초과 시 중단합니다. `PORTABLE_MAX_ASSET_BYTES`로 명시적으로 조정할 수 있습니다. Drive의 비공개 파일이나 HTML 오류 페이지는 이미지 성공으로 처리하지 않습니다. Supabase 원본은 삭제하지 않습니다.

## 보관과 향후 이관

성공한 암호화 파일을 Google Drive 비공개 백업 폴더 등 외부 장소에 보관하고 `.backup.local.env`의 복호화 키를 독립적으로 안전하게 보관하세요. 서버 연결 URL/암호화 키를 공개 저장소에 넣지 마세요.

현재 프로젝트 경로는 Google Drive 동기화 폴더 안에 있습니다. 로컬 파일 생성만으로 클라우드 업로드 완료가 확인되는 것은 아니므로 Drive 앱의 동기화 상태도 확인하세요. 복호화 키는 `.backup.local.env`의 `BACKUP_ENCRYPTION_KEY`이며 보관본과 함께 잃어버리면 복구할 수 없습니다. 이 보관본은 생성 시점의 스냅샷입니다. 이후 변경은 기존 Google 자동 백업을 함께 보관하거나 이 도구를 다시 실행해야 합니다.

복호화는 기존 `backup/restore.mjs`를 사용합니다. `BACKUP_ENCRYPTION_KEY`를 안전한 로컬 환경변수로 설정하여 `.enc`를 `.tar.gz`로 복호화하고 비공개 임시 폴더에 풉니다. `manifest.json` 해시를 확인한 뒤 빈 테스트 환경에서 복구 대상을 선택합니다.

Supabase에서 일반 PostgreSQL로 옮길 때 데이터/구조는 기초 자료가 되지만 `auth.uid()`·역할·RLS, 로그인/Auth, REST/RPC API, Edge Functions, 실시간 기능과 외부 알림/배포 설정은 별도로 이식하거나 대체해야 합니다. Supabase를 직접 운영하는 경우에도 스택 버전, 관리 스키마, 설정을 맞추고 복원 검증이 필요합니다. 운영 DB에 자동 `--clean`이나 덮어쓰기를 실행하는 기능은 넣지 않았습니다.

공식 참고: [백업/복원](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [직접 운영 환경으로 복원](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [SSL과 CA 인증서](https://supabase.com/docs/guides/platform/ssl-enforcement).
