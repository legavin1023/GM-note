# 게시글 Discord 복구

게시글도 현재 유효한 Discord 웹훅에 연결했습니다. 기본 대상은 공지 알림과 같은 채널입니다. 기존 만료된 `.env` 웹훅을 사용하는 PC 폴링 대신 Supabase에서 자동 발송합니다.

- `team_art_posts` INSERT → `discord-posts-notification` → 큐 → `discord-posts` Edge Function.
- 실제 게시글 내용/작성자와 `/GM-note/#/board/free?postId=…` 링크를 보냅니다. 스포일러 내용은 Discord에도 노출하지 않습니다.
- `DISCORD_POST_WEBHOOK_URL`은 Supabase 서버 Secret에만 저장합니다. 별도 값이 없으면 설치 도우미가 유효한 `DISCORD_NOTICE_WEBHOOK_URL`을 사용합니다.
- `discord-post-retry` Cron으로 실패를 매분 재시도하며 기한은 큐 등록 후 24시간입니다. Discord 메시지 ID와 성공 기록을 저장하여 성공한 글은 다시 보내지 않습니다. 응답 유실 시 완전한 exactly-once는 보장하지 않습니다.
- 기존 공지 발송/재시도와 Web Push 트리거는 유지됩니다. 과거 게시글을 일괄 재발송하지 않습니다.
- 게시글이 전체 공개된 현재 인증 사용자 정책인지 서버에서 확인합니다. 나중에 게시판 읽기 정책이 제한되면 Discord 발송도 중단합니다.
- PC를 켜놓거나 `npm run discord:watch-board`를 실행할 필요가 없습니다. 기존 스크립트는 기본적으로 서버 발송 안내 후 종료하여 중복을 방지합니다. 레거시 폴링을 되살려야 한다면 `BOARD_DISCORD_DELIVERY_MODE=legacy`가 필요하며 먼저 서버 트리거/재시도와 중복되지 않게 조정하세요.

적용 파일: `supabase/migration_discord_posts.sql`, `supabase/functions/discord-posts/*`, `supabase/config.toml`, 배포 도우미, watcher, 테스트. 서버 배포/웹훅 유효성 확인, 함수 HTTP 200, 트리거/RLS/독립 예약 활성화 및 payload 테스트를 완료했습니다. 실제 새 게시글 등록 후 채널 수신 확인은 별도로 가능합니다.

재설정: `node --use-system-ca scripts/web-push-admin.cjs repair-board-discord`.
검증: `node --use-system-ca scripts/web-push-admin.cjs verify-board-discord`.
테스트: `node --test tests/discord-posts.test.mjs tests/discord-notices.test.mjs`.
