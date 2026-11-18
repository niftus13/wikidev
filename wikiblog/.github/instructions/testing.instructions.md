---
description: "테스트를 작성하거나 수정할 때 적용한다."
applyTo: "**/*.{test,spec}.{ts,tsx,js,jsx},apps/*/test/**,tests/**"
paths:
  - "**/*.{test,spec}.{ts,tsx,js,jsx}"
  - "apps/*/test/**"
  - "tests/**"
---

# 테스트 지침

- 조건과 기대 결과가 드러나는 이름으로 구현 세부사항보다 관찰 가능한 동작을 검증한다.
- 변경된 기능의 정상·입력 오류·인증 및 권한 실패·예외 경로를 대상으로 한다. 사용자 공간 데이터는 교차 사용자 접근도 검증한다.
- DB 제약, 트랜잭션 및 동시성은 필요한 경우 실제 MySQL 통합 테스트로 검증한다. 테스트 데이터를 격리하고 정리하며 실행 순서에 의존하지 않는다.
- 고정 대기 대신 명시적 조건을 기다리고 실패를 숨기려고 단언을 제거하거나 테스트를 비활성화하지 않는다.
- API 테스트는 `pnpm build:libs` 이후 `pnpm --filter @wikiblog/api test`로 실행한다. 이 명령만으로는 환경 변수에 따라 통합 테스트가 건너뛰어질 수 있다.
- 실제 MySQL·Redis가 필요한 테스트는 Compose 실행 후 `docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test`로 실행하고, 미실행 또는 skip을 보고한다.
