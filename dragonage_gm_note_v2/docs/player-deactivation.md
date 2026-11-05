# 플레이어 비활성화

캐릭터 상세 화면의 삭제 버튼을 **플레이어 비활성화 / 다시 활성화**로 변경했습니다. 비활성화해도 `public.users` 캐릭터 행, 팀 연결, 작성한 게시글·댓글·기록을 삭제하지 않습니다. 마스터 목록에는 비활성 상태를 표시합니다.

- `users.is_active`는 기존 계정 모두 기본 true입니다.
- 마스터만 `set_player_active` RPC로 상태를 바꿀 수 있습니다. 마스터 계정 자체는 이 기능으로 비활성화할 수 없습니다.
- `player-login`은 비활성 계정의 PIN 설정/로그인/세션 발급을 거부합니다.
- 이미 로그인한 플레이어도 앱 테이블과 Storage의 authenticated RLS 제한으로 이후 DB 접근을 차단합니다. 팀/캐릭터 컨텍스트도 반환하지 않으며 다음 라우트 이동 때 로그아웃합니다. 이미 내려받은 화면/파일과 기존 만료 전 signed URL을 원격으로 회수하는 기능은 아닙니다.
- 비활성화 시 연결된 Auth 사용자의 Push 구독을 제거합니다. 다시 활성화하면 기존 PIN/계정으로 로그인할 수 있지만 기기 알림은 다시 신청해야 합니다.
- 활성 플레이어와 마스터의 기존 알림/기능은 유지됩니다. 새로운 RLS 테이블을 나중에 추가하면 비활성화 migration을 재실행해 guard를 적용해야 합니다.

원격 적용: `supabase/migration_player_deactivation.sql`, `player-login` 배포. 롤백 테스트로 기록 보존, 비활성 세션 RLS, 마스터 전용 상태 변경, 재활성화, 기존 Push 안전 검사 동작을 확인했습니다. 실제 플레이어 상태는 테스트에서 변경하지 않았습니다.

재설정: `node --use-system-ca scripts/web-push-admin.cjs deactivate-players`.
검증: `node --use-system-ca scripts/web-push-admin.cjs test-deactivation`.
