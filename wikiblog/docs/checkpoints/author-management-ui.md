# 체크포인트 요구사항: 작성자 화면 — 목차·이력 정리와 분류 관리 UI

- 작성: 2026-11-18
- 마일스톤: `history.md`의 **작성자 화면 (일부 구현)** 완료
- 상태: **확정** (2026-11-18, [7절](#7-미결-질문과-추천안) 추천안 A 승인)
- 설계 원본: Notion [WikiDocs형 블로그 플랫폼 설계안](https://app.notion.com/p/WikiDocs-41a2d703a2f881a7985eff5af6845fb1?source=copy_link) §6·§11 (2026-11-18 현행화)

## 1. 배경과 현재 상태

`README.md`와 `history.md`에는 "목차·이력·분류 관리 화면은 후속 단계"라고 적혀 있다.
하지만 실제 코드(커밋 `6fc676b`)를 보면 다음과 같다.

| 기능 | 코드 상태 | 위치 |
| --- | --- | --- |
| 목차 이동·순서 변경 UI | **구현됨**, 브라우저 검증·문서화 안 됨 | `apps/web/app/pages/dashboard/books/[bookId]/pages/index.vue`, `app/utils/toc.ts`, `test/toc.test.ts` |
| 이력 조회·과거 버전 복원 UI | **구현됨**, 브라우저 검증·문서화 안 됨 | `apps/web/app/pages/dashboard/books/[bookId]/pages/[pageId].vue` |
| 분류 관리 UI (카테고리·태그 관리, 책·페이지 분류 지정) | **미구현** | — |
| 분류 관리 API | 구현·테스트됨 | `apps/api/src/{routes,controllers,services,repositories}/classifications.ts` |

따라서 이번 체크포인트는 **A. 이미 구현된 목차·이력 UI를 검증하고 문서를 맞추는 일**과
**B. 분류 관리 UI를 새로 구현하는 일**로 나눈다. 필요한 API는 모두 있으므로
**백엔드 변경 없이 진행하는 것을 기본**으로 한다.

## 2. 하네스 적용

| 작업 | 에이전트 | 스킬 | 자동 적용 지침 |
| --- | --- | --- | --- |
| A. 목차·이력 검증과 문서 정리 | `frontend-engineer` | `frontend-feature`, `publishing-workflow` | `rules/frontend.md` |
| B1~B3. 카테고리·태그 관리, 책 분류 | `frontend-engineer` | `frontend-feature` | `rules/frontend.md`, `rules/testing.md` |
| B4. 페이지 분류 (revision·이력 연동) | `frontend-engineer` | `frontend-feature`, `publishing-workflow` | 위와 같음 |
| API 계약이 부족할 때만 | `backend-engineer` | `backend-feature` | `rules/backend.md` (사용자 확인 후 진행) |
| 완료 전 리뷰 | `quality-reviewer` | — | 읽기 전용 |

- 공통 지침(`CLAUDE.md` → `.github/copilot-instructions.md`)의 "작업 전 → 구현 → 검증과 보고" 순서를 따른다.
- 확인되지 않은 API 계약은 프론트엔드에서 임의로 정하지 않는다. 계약이 부족하면 작업을 멈추고 보고한다.
- 서버를 권한의 최종 기준으로 삼는다. UI에서 숨기는 것은 권한 검사가 아니다.

## 3. 범위

### A. 목차·이력 UI 검증과 문서 정리

| ID | 요구사항 |
| --- | --- |
| A-1 | 목차 이동 UI를 실제 API와 연결한 브라우저에서 검증한다: 최상위·하위 이동, 형제 순서 변경, 자기 자손을 부모 후보에서 제외, 발행된 페이지를 미발행 부모 아래로 이동할 때 409 안내, 다른 탭에서 목차를 바꾼 뒤의 revision 충돌 409와 최신 목차 다시 불러오기. |
| A-2 | 이력 UI를 검증한다: 최신 revision 순 목록, 버전 미리보기(Markdown 안전 렌더링), 미저장 변경이 있을 때 복원 차단, 복원 후 새 revision 생성과 공개본 유지, 오래된 revision 복원 시 409. |
| A-3 | 검증 중 결함이 나오면 이 체크포인트에서 고친다. 동작을 바꾸지 않는 개선은 하지 않는다. |
| A-4 | `README.md`의 "화면과 URL"·"작성자 페이지 관리 화면" 절과 `history.md`의 체크포인트·마일스톤을 실제 구현에 맞게 고친다. |

### B. 분류 관리 UI

#### 화면 배치 (Q1 결정)

| 화면 | 경로·위치 | 진입 링크 |
| --- | --- | --- |
| 작성자 카테고리·태그 관리 (B1, B3 태그) | `/dashboard/categories` | 내 책 관리 화면의 "분류 관리" |
| 책별 페이지 카테고리 관리 (B2) | `/dashboard/books/{bookId}/categories` | 페이지 목록 화면의 "페이지 카테고리" |
| 책 분류 지정 (B3) | `/dashboard/books`의 각 책에 있는 **분류** 패널 | 책 수정 폼과 별도로 저장 |
| 페이지 분류 지정 (B4) | 페이지 편집 화면의 **분류** 패널 | 본문 저장과 별도로 저장 |

#### B1. 내 책 카테고리 관리 (작성자 범위, 계층형)

- 목록: `GET /api/v1/me/categories` → `CategoryDto[]`. 응답은 `parentId` 기반이므로 트리로 그려서 보여준다.
- 생성·수정: `POST /api/v1/me/categories`, `PATCH /api/v1/me/categories/{id}`에 `{ name, parentId }`를 보낸다. 이름은 trim 기준 1~100자이다.
- 부모 선택지에서 자기 자신과 자손을 제외한다. 서버도 순환을 400으로 거부하지만 UI에서 먼저 막는다. `utils/toc.ts`의 `possibleParents`와 같은 패턴을 쓰고, 공통화가 필요하면 순수 함수로 분리해 단위 테스트한다.
- 삭제: `DELETE …/{id}`, 성공하면 204. 하위 카테고리나 연결된 콘텐츠(논리 삭제된 콘텐츠와 과거 이력 포함)가 있으면 **409**를 반환하므로, 삭제할 수 없는 이유와 다음 행동을 안내한다.

#### B2. 책별 페이지 카테고리 관리 (책 범위, 계층형)

- 목록 `GET /api/v1/me/books/{bookId}/categories`, 생성 `POST /api/v1/books/{bookId}/categories`, 수정·삭제 `PATCH|DELETE /api/v1/books/{bookId}/categories/{id}`.
- 규칙(계층, 순환 방지, 삭제 409)은 B1과 같다. B1과 같은 컴포넌트를 범위만 바꿔 재사용한다.

#### B3. 태그 관리와 책 분류 지정

- 태그: 목록 `GET /api/v1/me/tags`, 생성 `POST /api/v1/me/tags` `{ name }`(201), 삭제 `DELETE /api/v1/me/tags/{id}`(204).
  - 태그는 `/dashboard/categories`에서만 만든다(Q3 결정).
  - 서버는 앞뒤 공백과 선행 `#`을 제거하고 영문 대소문자를 무시해 중복을 판단한다. 중복은 **409**이고, 이미 있는 태그라고 안내한다. 웹에서 정규화를 따로 구현하지 않는다.
  - 연결된 태그 삭제는 409이다. 태그 이름 변경 API는 없으므로 UI에도 넣지 않는다.
- 책 분류 지정은 `PATCH /api/v1/books/{bookId}/classification`에 `{ platformCategoryId, spaceCategoryId, tagIds }`를 보낸다. **모든 필드가 필수**이다.
  - 현재 값은 `GET /api/v1/me/books/{bookId}/classification`으로 불러온다.
  - 플랫폼 카테고리 선택지는 `GET /api/v1/categories`를 쓰고, **1개 이상일 때만 필드를 보여준다**(Q2 결정).
  - 필드를 숨긴 상태에서도 불러온 `platformCategoryId`를 그대로 다시 보낸다. `null`로 덮어쓰지 않는다.
  - 태그는 기존 태그 중에서만 고른다. 폼에는 "태그 관리로 이동" 링크를 둔다.
  - 태그는 최대 50개, 중복 없이 보낸다.
  - **책 분류는 저장 즉시 공개된다**는 점을 저장 전에 안내한다.

#### B4. 페이지 분류 지정 (revision·이력 연동)

- 현재 초안의 분류는 `GET /api/v1/me/pages/{pageId}/classification` → `{ revision, categoryId, tagIds }`로 불러온다.
- 변경은 `PATCH /api/v1/pages/{pageId}/classification`에 `{ revision, categoryId, tagIds }`를 보낸다. 성공하면 **revision이 1 증가하고 새 이력이 생긴다**. 응답 `{ revision, categoryId, tagIds }`로 편집 화면의 draft revision을 바로 갱신한다. 갱신하지 않으면 다음 본문 저장이나 발행이 409로 실패한다.
- 선택지는 이 책의 페이지 카테고리(B2)와 내 태그(B3)이다. 새 태그는 만들지 않고 "태그 관리로 이동" 링크를 둔다. 미저장 내용이 있을 때 이 링크로 나가면 기존 이탈 확인이 뜨는지 검증한다.
- 본문·제목에 미저장 변경이 있으면 분류 저장을 막고 먼저 저장하도록 안내한다. 기존 복원 UI의 `dirty` 처리와 같다.
- 409 충돌 시 선택한 분류를 유지한 채 최신 초안을 다시 불러오도록 안내한다.
- **페이지 분류는 재발행해야 공개된다**는 점을 안내한다. 발행 버튼의 동작은 바꾸지 않는다.
- 분류 변경이 이력 목록에 새 revision으로 나타나는지, 복원 시 분류도 함께 복원되는지 검증한다.

### 공통 UX 요구사항 (`rules/frontend.md`)

- 비동기 영역마다 로딩·빈 상태·성공·오류·재시도 상태를 둔다. 중복 제출을 막고, 실패해도 입력을 보존한다.
- 401/403은 기존 화면의 세션 만료 안내와 "새 탭에서 로그인" 패턴을 따른다. 404는 "찾을 수 없거나 관리 권한이 없음"으로 안내한다.
- 모든 변경 요청에 `X-CSRF-Token`을 보낸다(`/api/v1/auth/session`의 `csrfToken`).
- `@wikiblog/dto` 타입을 사용한다: `CategoryDto`, `CategoryInput`, `TagDto`, `BookClassificationInput`, `BookClassificationDto`, `PageClassificationInput`, `PageClassificationDto`.
- 의미 있는 HTML과 라벨을 쓰고, 키보드만으로 조작할 수 있게 한다. 모바일·데스크톱 레이아웃을 확인한다. 기존 `main.css`의 색상·간격·버튼 스타일을 따른다.
- 카테고리·태그 이름은 텍스트로만 렌더링한다(`v-html` 금지).

## 4. 범위 밖

- 플랫폼 카테고리 관리, 초기 데이터, 운영자 인증 (보류된 정책)
- 발행 취소, 삭제 복구 (API 보류)
- 태그 이름 변경, 카테고리 일괄 이동, 드래그 앤 드롭 정렬
- 분류 폼에서 태그 즉석 생성. `normalizeTag`를 `libs/shared`로 옮기는 작업과 함께 후속 체크포인트로 둔다(Q3).
- 사용자 공간 화면 `/@{handle}`과 공간 소개 편집 화면 (설계안 §6에 있으나 미구현. API `GET`/`PATCH /api/v1/spaces/{handle}`는 있음). `history.md` 마일스톤의 별도 단계로 진행한다.
- 백엔드 API·스키마 변경 (필요하면 중단하고 사용자에게 확인)

## 5. 수용 기준

- [ ] A-1~A-4: 목차·이력 UI를 브라우저에서 검증하고, 결함을 고치고, README·history를 현행화했다.
- [ ] 작성자 카테고리를 생성·이름 변경·부모 이동·삭제할 수 있고, 순환 이동과 사용 중 카테고리 삭제가 안내와 함께 거부된다.
- [ ] 책별 페이지 카테고리도 같은 동작을 하고, 다른 책의 카테고리는 선택지에 나오지 않는다.
- [ ] 태그를 생성·삭제할 수 있고, `#Tag`/`tag` 같은 중복과 사용 중 태그 삭제가 409 안내로 처리된다.
- [ ] 책 분류를 저장하면 공개 책 화면과 `/search?categoryId=…&tag=…`에 바로 반영된다.
- [ ] 페이지 분류를 저장하면 revision이 증가해 이력에 나타나고, 재발행 전에는 공개 페이지 분류가 바뀌지 않으며, 재발행 후 반영된다.
- [ ] 분류 저장 후 본문 저장·발행이 409 없이 이어진다(draft revision 갱신 확인).
- [ ] 미저장 본문이 있을 때 분류 저장이 막힌다. 다른 탭에서 수정한 뒤 분류 저장 시 409 안내가 나오고 입력이 보존된다.
- [ ] 세션 만료, 다른 사용자의 책·페이지 URL 직접 접근(404)에서 데이터가 노출되지 않는다.
- [ ] 로딩·빈 상태·오류·재시도, 키보드 조작, 모바일 화면을 확인했다.

## 6. 검증 (`CLAUDE.md` 명령)

```bash
pnpm build:libs
pnpm --filter @wikiblog/web typecheck
pnpm --filter @wikiblog/web test        # 추가한 트리·부모 후보 순수 함수 테스트 포함
pnpm --filter @wikiblog/web build
docker compose up --build -d             # worktree에서는 -p wikiblog-wt
docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test   # API 회귀 확인
```

- 브라우저 검증은 실제 API에 연결한 상태에서 한다. 브라우저 도구가 없으면 확인하지 않았다고 명시한다.
- 완료 보고에는 변경 내용, 실행한 검증과 결과, 실행하지 못한 검증, 남은 위험을 적는다. `history.md`에 체크포인트와 검증 기록을 추가한다.
- 커밋 전에 `quality-reviewer`로 권한·격리·revision 충돌·접근성 누락을 검토한다.

## 7. 미결 질문과 추천안

각 질문의 **추천**을 기본안으로 삼는다. 승인되면 "결정"에 날짜를 적고 3절과 README에 반영한다.

### Q1. 분류 관리 화면의 위치와 URL

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 관리 범위별로 전용 화면을 둔다. `/dashboard/categories`에서 작성자 카테고리와 태그를, `/dashboard/books/{bookId}/categories`에서 책별 페이지 카테고리를 관리한다. 책 분류는 `/dashboard/books`의 각 책에 별도 **분류** 패널로, 페이지 분류는 페이지 편집 화면의 별도 패널로 지정한다. |
| B | 기존 화면 안에 넣는다. 작성자 카테고리·태그는 `/dashboard/books` 상단에, 페이지 카테고리는 페이지 목록 화면에 둔다. |

- **추천 이유**
  - URL이 API의 관리 범위(`/me/categories`, `/books/{bookId}/categories`)와 1:1로 맞는다.
  - 기존 `/dashboard/books/...` 패턴을 그대로 따른다.
  - 페이지 목록 화면(약 240줄)에는 이미 생성·이동·삭제가 들어 있어, 더 넣으면 상태 관리가 복잡해진다.
- **영향**
  - 책 분류와 페이지 분류는 각각 **자기 저장 버튼**을 가진다.
  - 책 분류는 책 수정 폼과 API가 달라서, 한 버튼으로 두 요청을 보내면 한쪽만 실패하는 경우를 처리해야 한다. 그래서 묶지 않는다.
  - 내 책 관리 화면에 "분류 관리" 링크를, 페이지 목록 화면에 "페이지 카테고리" 링크를 추가한다.
- 결정: **A** (2026-11-18 승인)

### Q2. 플랫폼 카테고리 선택 필드

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | `GET /api/v1/categories`가 1개 이상일 때만 필드를 보여준다. 비어 있으면 숨긴다. |
| B | 항상 보여주고, 비어 있으면 "아직 플랫폼 분류가 없습니다"라고 안내한다. |
| C | 이번 체크포인트에서는 아예 다루지 않는다. |

- **추천 이유**
  - 초기 데이터와 운영자 관리 API가 보류 상태라 지금은 고를 수 있는 값이 없다. 빈 선택 필드는 작성자에게 쓸모가 없다.
  - 데이터가 생기면 코드를 바꾸지 않아도 필드가 나타난다.
- **영향 (필수)**
  - `PATCH /books/{id}/classification`은 모든 필드를 요구한다.
  - 필드를 숨긴 상태에서도 `GET /me/books/{id}/classification`으로 받은 `platformCategoryId`를 **그대로 다시 보내야 한다**. `null`로 덮어쓰면 안 된다.
  - C를 고르면 이 보존 처리를 빠뜨리기 쉬우므로 권하지 않는다.
- 결정: **A** (2026-11-18 승인)

### Q3. 태그 즉석 생성

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 이번 체크포인트에서는 `/dashboard/categories`의 태그 관리에서만 만든다. 책·페이지 분류 폼에서는 기존 태그만 고르고, "태그 관리로 이동" 링크를 둔다. |
| B | 분류 폼에서 바로 만든다. `POST /me/tags`로 생성한 뒤 자동으로 선택하고, 중복이면(409) 같은 이름의 기존 태그를 찾아 선택한다. |

- **추천 이유**
  - B에서 중복 태그를 찾으려면 서버의 정규화 규칙(trim, 선행 `#` 제거, 영문 소문자화)을 웹에 똑같이 구현해야 한다.
  - 지금 그 규칙은 `apps/api/src/services/classifications.ts`의 `normalizeTag`에만 있다. 웹과 공유하려면 `libs/shared`로 옮기는 백엔드 변경이 필요한데, 이는 "백엔드 변경 없이 진행" 원칙에 어긋난다.
  - A만으로도 수용 기준을 모두 충족한다.
- **영향**
  - 페이지를 편집하다가 태그 관리 화면으로 가면, 미저장 내용이 있을 때 기존의 이탈 확인이 뜨는지 검증한다.
  - B는 `normalizeTag`를 `libs/shared`로 옮기는 작은 백엔드 작업(`backend-engineer`, `backend-feature`)과 함께 후속 체크포인트로 둔다.
- 결정: **A** (2026-11-18 승인)
