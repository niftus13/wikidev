---
name: frontend-feature
description: "Use when implementing or changing Nuxt or Vue screens, forms, composables, state, or API integration."
---

# 프론트엔드 기능 구현

1. 사용자 흐름, 권한, 입력·출력, 유사 화면과 API 계약을 확인한다. 미확정 계약은 임의로 결정하지 않는다.
2. 기존 컴포넌트·composable 및 `@wikiblog/dto` 사용을 조사하고 백엔드를 권한 기준으로 삼는다.
3. 로딩·빈 상태·성공·오류, 입력 검증, 중복 제출, 재시도와 입력 보존을 설계한다.
4. 기존 구조를 따라 구현하고 의미 있는 HTML, 라벨, 키보드 조작, 화면 크기별 사용성을 고려한다.
5. 정상·오류 흐름과 관련 타입 검사를 실행하고 브라우저가 제공될 때 주요 화면과 키보드 조작을 검증한다.
6. 구현한 흐름, 검증 결과, 확인하지 못한 부분과 API 의존성을 보고한다.
