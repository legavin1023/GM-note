# 주간 전체 백업

대상은 `dragonage-trpg` (`cammbwzdpymunyobvszu`)의 PostgreSQL 전체 덤프와 **모든 Storage 버킷의 실제 파일**입니다. 게시글, 댓글, 팀, 사용자/Auth 데이터, 이미지, HTML 로그, DB 정책/함수/트리거가 포함됩니다. Storage의 DB 메타데이터만 저장하는 방식이 아닙니다.

## 일정과 보관

- 매주 월요일 오전 **04:17 한국 시간** (`17 19 * * 0` UTC).
- GitHub의 예약 실행은 혼잡 시 지연될 수 있습니다. 컴퓨터가 꺼져 있어도 실행됩니다.
- 별도 비공개 저장소: <https://github.com/legavin1023/dragonage-trpg-backups>.
- 백업은 AES-256-GCM으로 암호화한 단일 파일입니다. 공개 사이트 저장소에 DB/첨부파일/키를 올리지 않습니다.
- 성공한 최근 **4개**를 유지하고, 파일 자체의 만료 기간은 35일입니다. 새 백업 업로드 성공 후에만 오래된 파일을 정리합니다. 연속 실패 시 오래된 파일도 만료될 수 있으므로 실패 메일을 확인하세요.
- 한 번의 암호화 백업 크기는 95 MB 이하로 제한했습니다. 무료 Actions 저장 공간을 넘기는 위험을 줄이기 위한 제한입니다. 계정 내 다른 저장소의 사용량도 합산되므로 무조건 무료를 보장하는 설정은 아닙니다. GitHub **Settings → Billing and licensing → Budgets and alerts**에서 Actions 예산/초과 사용 설정을 확인하세요.
- 서버나 유료 Push/백업 서비스를 추가하지 않습니다.

## 보안과 일관성

DB는 전용 `dragonage_weekly_backup` 읽기 전용 계정으로 접속합니다. RLS를 우회하여 모든 사용자의 자료를 읽되 일반 앱 계정과 기존 인증은 바꾸지 않습니다. PostgreSQL repeatable-read snapshot을 덤프와 Storage 목록에 공유합니다. 파일은 4개씩 다운로드하고 크기와 SHA-256을 기록합니다. DB 덤프 후 Storage 목록/수정 시간이 바뀌면 실패하여 다음 실행에서 다시 백업해야 합니다. 파일 변경을 금지하는 잠금은 아니므로 사용량이 적은 시간에 실행하도록 했습니다.

Storage 비공개 파일 다운로드에는 서버용 Service Role Key가 필요합니다. 키는 비공개 백업 저장소의 Actions Secrets에만 등록하며 프론트엔드에 넣지 않습니다. Vault 값은 DB 외의 `vault.json`에도 저장하지만 **암호화된 아카이브 내부**에만 있습니다. 새 프로젝트의 Vault 암호화 키가 달라질 때 다시 등록하는 데 사용합니다.

설치 시 `.env`, `supabase/functions/.env`의 복구 설정을 암호화 내부의 `recovery-config.json`에 보관합니다. 이후 로컬 환경 파일을 변경하면 자동으로 갱신되지 않습니다. 프로젝트 소스와 Edge Function 코드는 기존 Git 저장소/로컬 프로젝트도 별도로 보관해야 합니다. Supabase의 서버 OS, Dashboard 설정, 이후 변경한 Edge Function Secrets 전체를 자동으로 복제하는 기능은 아닙니다.

## 다운로드 및 수동 실행

1. 비공개 백업 저장소 → **Actions → Weekly full encrypted backup**.
2. **Run workflow → Run workflow**로 즉시 실행할 수 있습니다.
3. 초록색 성공 실행을 열고 하단 **Artifacts → dragonage-full-…**를 다운로드합니다.
4. ZIP 안의 `dragonage.backup.enc`가 실제 암호화 백업입니다.

`Actions → … → Enable workflow`가 표시되면 다시 활성화하세요. 실패 알림은 GitHub의 **Settings → Notifications → Actions**에서 확인할 수 있습니다.

## 복호화와 검증

프로젝트의 **`.backup.local.env`는 JSON 형식의 비밀 복구 파일**입니다. Git에서 제외되어 있습니다. 이 파일과 암호화 백업을 서로 다른 안전한 장소에 보관하세요. 암호화 키를 잃으면 백업을 복호화할 수 없습니다. 채팅이나 공개 저장소에 붙여넣지 마세요.

Windows PowerShell에서 프로젝트 폴더 기준:

```powershell
$backupConfig = Get-Content -Raw .backup.local.env | ConvertFrom-Json
$env:BACKUP_ENCRYPTION_KEY = $backupConfig.BACKUP_ENCRYPTION_KEY
node backup/restore.mjs backup-output/dragonage.backup.enc backup-output/restored.tar.gz
Remove-Item Env:BACKUP_ENCRYPTION_KEY
New-Item -ItemType Directory -Force backup-output/restored
tar -xzf backup-output/restored.tar.gz -C backup-output/restored
node backup/verify.mjs backup-output/restored
```

출력 경로에 기존 파일이 있으면 덮어쓰지 않습니다. 복호화는 인증 태그를 검사하고, 변조/잘못된 키로 실패하면 부분 복호화 파일을 삭제합니다. 복호화된 폴더에는 개인정보와 키가 있으므로 외부에 공유하지 마세요.

내부 구성:

- `database.dump`: PostgreSQL custom-format 전체 덤프.
- `manifest.json`: 버킷 설정, 파일 원래 경로/메타데이터/크기/SHA-256, DB/복구 파일 SHA-256.
- `storage/<object-id>.bin`: 실제 첨부파일. 원래 파일명/버킷은 manifest에 기록됩니다.
- `roles.json`: DB 역할 설정과 역할 멤버십. 역할 비밀번호는 포함하지 않습니다.
- `vault.json`: 복구용 Vault 원문.
- `recovery-config.json`: 설치 당시 서버 환경 설정.

## 실제 복원

**운영 DB에 바로 복원하지 말고 먼저 별도의 테스트 DB/프로젝트에서 확인하세요.** `pg_restore --list database.dump`로 복구 목록을 확인할 수 있습니다. PostgreSQL 17 도구를 사용하세요.

일반 PostgreSQL의 빈 테스트 DB에는 역할/확장 준비 후 `pg_restore --no-owner --no-privileges --dbname=... database.dump`를 사용합니다. Supabase 프로젝트에는 이미 `auth`, `storage` 등 관리 스키마와 역할이 있으므로 전체 덤프를 그대로 덮어쓰면 충돌할 수 있습니다. 덤프 목록에서 복원 대상을 선택하고 Supabase 공식 복원 절차에 따라 역할, 스키마, 데이터, 사용자 정의 정책/트리거를 복원해야 합니다. 자동으로 `--clean`을 실행하는 도구는 넣지 않았습니다.

Storage 파일 복원은 manifest의 bucket_id/name으로 같은 버킷을 준비하여 Storage API를 통해 다시 업로드해야 합니다. SQL로 storage.objects만 복원하면 파일이 생기지 않습니다. 업로드 후 현재 사용자 권한과 파일 경로를 확인하세요. Vault는 `vault.json`의 값을 새 프로젝트에 재등록하고, Push VAPID/웹훅 등 Edge Function Secrets도 별도로 설정해야 합니다. 새로운 프로젝트를 사용한다면 URL/키/웹훅 주소도 갱신해야 합니다.

현재 자동 테스트는 암호화 왕복/변조 거부이며, 실제 백업 실행·다운로드 검증 상태는 작업 완료 보고를 참고하세요. 별도 Supabase 프로젝트로 전체 복원까지 테스트한 상태로 간주하면 안 됩니다.

참고: [Supabase 공식 자동 백업 안내](https://supabase.com/docs/guides/deployment/ci/backups), [Supabase 프로젝트 복원](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [GitHub Artifact 다운로드](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).
