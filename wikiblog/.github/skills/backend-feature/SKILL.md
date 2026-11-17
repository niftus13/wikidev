---
name: backend-feature
description: "Use when implementing or changing Express API features, authentication, user-space ownership, MySQL migrations, or backend integration tests."
---

# 백엔드 기능 구현

1. 사용자 목표, 요청·응답·오류, 인증 및 소유권 조건을 확인한다. 미결 정책은 사용자에게 확인한다.
2. `apps/api`, `libs/dto`, `libs/entities`, 기존 테스트와 migration에서 유사 구현을 찾는다.
3. MVC 형태로 역할을 나눈다. 라우트는 경로를 연결하고 controller는 HTTP 요청·응답을 처리하며, service는 비즈니스 규칙과 필요한 트랜잭션을 담당한다. DB 접근은 model에 해당하는 entity와 데이터 접근 코드에서 처리한다. 예: controller에서 SQL을 직접 실행하지 않고 service를 거쳐 데이터 접근 코드를 호출한다.
4. DB 데이터는 `libs/entities`의 entity 타입으로 표현하고, 외부 요청·응답 계약은 `libs/dto`의 DTO를 사용한다. DTO를 신뢰 경계에서 런타임 검증하고 필요한 필드만 entity와 DTO 사이에서 변환한다. 예: 비밀번호 해시를 포함한 사용자 entity를 API 응답으로 직접 반환하지 않는다.
5. 공통 메소드·클래스는 기존 구현을 먼저 찾아 재사용하고, 실제 공유가 필요한 경우 적절한 공통 위치로 분리한다. 웹과 API에서 쓰는 순수 로직은 `libs/shared`에, 서버 전용 로직은 `apps/api`에 둔다. 필요한 계약은 interface로 정의하며 공통 타입은 `libs/types`를 활용한다.
6. 세션·CSRF, 소유권 범위와 관련 객체의 범위를 설계한다. 예: A의 책에 B의 카테고리를 연결하는 요청을 거부한다.
7. 원자성·중복 요청·동시성·기존 데이터 영향을 검토하고 필요한 경우 새 migration을 추가한다.
8. DTO, 호출자와 API 문서를 함께 갱신한다. 기존 코드가 MVC로 분리되지 않았더라도 작업 범위를 넘어 일괄 리팩터링하지 않는다.
9. 정상·입력 오류·비인증·타 사용자 접근을 테스트하고 해당 DB 제약과 충돌은 실제 통합 테스트로 검증한다.
10. 관련 테스트와 타입 검사 결과, 실행하지 못한 검증 및 남은 위험을 보고한다.
