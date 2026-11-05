# 전체공지 Discord 알림 복구

기존 `notices`에는 `discord-notices-notification` 트리거가 있었고 `smooth-responder` Edge Function을 호출했습니다. 해당 함수는 Discord 응답을 확인하지 않고 항상 HTTP 200을 반환했습니다. 기존 함수에 저장된 공지 웹훅과 로컬 게시글 웹훅은 모두 Discord에서 HTTP 404를 반환했습니다.

**공지 복구 완료:** 사용자가 등록한 새 웹훅의 HTTP 200 확인, 서버 Secret 등록, `discord-notices` 배포, 공지 트리거 교체 및 재시도 Cron 활성화를 완료했습니다. 누락된 최신 공지의 성공 기록을 확인하고 실제 Discord 메시지도 GET으로 재조회하여 공지 상세 링크까지 검증했습니다. 아래 설정 절차는 이후 재설정용입니다. 기존 게시글 watcher 웹훅은 별도로 여전히 404 상태입니다.

## 사용자가 해야 할 한 단계

알림을 받을 Discord 채널 → **채널 편집(톱니바퀴) → 연동 → 웹후크 → 새 웹후크** → 대상 채널 확인 → **웹후크 URL 복사**.

Git에서 제외된 `supabase/functions/.env`에 아래 항목을 추가합니다. 기존 VAPID/Push 설정은 유지하세요.

```dotenv
DISCORD_NOTICE_WEBHOOK_URL=복사한_실제_Discord_웹후크_URL
```

실제 URL은 토큰이 포함된 비밀이므로 채팅/공개 저장소에 올리지 마세요. 추가한 뒤 완료라고 알려주면 서버 Secret 등록, 함수 배포, DB 트리거 교체, 최근 공지 재전송 확인을 이어서 처리할 수 있습니다.

## 준비된 구현

- `supabase/functions/discord-notices/`: 공지 실제 제목/내용과 `/GM-note/#/notices/:noticeId` 링크를 Discord embed로 전송. `allowed_mentions`로 원하지 않는 멘션 방지. `wait=true`로 Discord 메시지 ID를 받아 성공 기록.
- `supabase/migration_discord_notices.sql`: 공지 INSERT를 서버 큐에 추가. 기존 공지 Discord 트리거만 대체하고 Web Push/게시글 watcher는 유지. 매분 실패 재시도, 성공 공지 중복 방지, 24시간 재시도 제한. 적용 시 최근 24시간의 마지막 공지 1건만 복구 대상으로 추가.
- 서버 Secret `DISCORD_NOTICE_WEBHOOK_URL`, 기존 `PUSH_WEBHOOK_SECRET`/Vault 인증을 사용. 프론트엔드에는 키를 넣지 않음.
- `discord_notice_deliveries`는 RLS 적용, 일반 사용자는 접근 불가.
- 전송 응답을 잃은 상황에서는 재시도 중 중복 가능성이 남아 있음.
- 기존 `smooth-responder`는 다른 기능이 사용할 가능성이 있어 그대로 보존. 다운로드한 원본은 Git에서 제외된 `.backup-tools/discord-original`에 보관.

## 연결 후 실행 순서

```powershell
node --use-system-ca scripts/web-push-admin.cjs prepare-discord
node --use-system-ca scripts/web-push-admin.cjs deploy-discord
```

첫 명령은 웹훅 유효성을 GET으로 확인하고 서버 Secret에 등록합니다. 둘째는 새 Edge Function 배포 후 SQL을 적용합니다. 로컬 단위 테스트: `node --test tests/discord-notices.test.mjs`.

확인 위치: Supabase **Edge Functions → discord-notices → Logs**, **Integrations → Cron → discord-notice-retry**. 성공 기록은 SQL Editor에서 `SELECT notice_id,sent_at,message_id FROM public.discord_notice_deliveries ORDER BY created_at DESC;`로 확인하며 Discord 채널에서도 실제 메시지를 확인하세요.

게시글도 이후 서버 발송으로 복구했습니다. 만료된 watcher 웹훅을 사용하는 대신 현재 유효한 서버 Secret을 사용합니다. [게시글 Discord 복구](discord-posts.md)를 참고하세요. 공지와 게시글 모두 PC 상시 실행이 필요 없습니다.
