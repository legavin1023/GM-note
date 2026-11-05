# 로그인 보안 패치 적용

1. Supabase SQL Editor에서 supabase/migration_security_login_hardening.sql 실행. 기존 PIN 및 공유 GM 권한 마이그레이션이 먼저 필요합니다.
2. supabase functions deploy player-login 명령으로 로그인 함수를 배포합니다. SQL을 먼저 적용해야 합니다.
3. 정상 PIN 로그인, 잘못된 PIN 5회 이후 차단, 일반 계정의 users.role/id 변경 거부를 확인합니다. SQL만 적용해도 역할 보호는 작동하지만 원자적 PIN 제한에는 함수 배포가 필요합니다.

기존 PIN과 최초 설정 흐름은 유지됩니다. 공통 최초 설정 코드에 의한 계정 선점 위험은 아직 남아 있습니다. 계정별 일회용 초대 코드로 교체하는 추가 작업이 필요합니다.

검증: node --test tests/player-login-security.test.cjs (로그인 성공/실패/차단/DB 오류/알 수 없는 결과). 실제 PostgreSQL 트리거 및 동시 요청 검증은 운영 적용 전 별도 DB에서 필요합니다.
