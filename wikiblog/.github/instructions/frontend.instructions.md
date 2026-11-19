---
description: "Nuxt와 Vue 화면, 상태 및 API 연동을 변경할 때 적용한다."
applyTo: "apps/web/**"
paths:
  - "apps/web/**"
---

# 프론트엔드 지침

- 기존 페이지·컴포넌트·composable 패턴을 조사하고 실제 재사용이 필요한 경우에만 추출한다.
- 화면 전반에서 색상·타이포그래피·간격·내비게이션과 상태 표현을 일관되게 유지한다. GitHub Docs와 WikiDocs의 문서 탐색·독서 UI를 참고하되 화면과 콘텐츠를 그대로 복제하지 않는다.
- API 계약과 `@wikiblog/dto`를 확인하고 서버를 권한의 최종 기준으로 삼는다. UI에서 버튼을 숨기는 것은 권한 검사가 아니다.
- 비동기 화면에서 로딩·빈 상태·성공·오류와 재시도, 폼의 입력 오류 및 중복 제출을 고려한다. 실패 시 사용자가 다음 행동을 알 수 있게 한다.
- 의미에 맞는 HTML, 입력 라벨, 오류 안내, 키보드 조작과 모바일·데스크톱 화면을 확인한다.
- 서버 전용 자격 증명이나 DB 엔티티를 웹에 포함하지 않는다. 사용자 콘텐츠는 안전하게 렌더링한다.
- 관련 정상·실패 흐름을 테스트하고 이용 가능한 타입 검사와 브라우저 검증을 수행한다. 브라우저를 사용할 수 없으면 명시한다.
- 스타일은 `app/assets/css/main.css`의 기존 클래스와 Tailwind v4 유틸리티를 함께 쓴다. Tailwind는 preflight 없이 theme·utilities 레이어만 가져오고, 색·반경·컨트롤 높이는 main.css 변수를 `@theme inline`으로 연결한 토큰(`text-accent`, `border-line`, `rounded-control`, `h-control` 등)을 쓴다. 버튼은 `.button` 계열을 재사용한다.
- 아이콘은 `@lucide/vue`(구 `lucide-vue-next`) 컴포넌트를 import한다. 장식 아이콘은 `aria-hidden="true"`, 아이콘만 있는 버튼에는 `aria-label`을 둔다.
