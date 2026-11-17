# WikiBlog

사용자별 독립 공간에서 온라인 책과 페이지를 작성하고 공유하는 WikiDocs형 블랫폼입니다.
독자는 로그인 없이 공개된 콘텐츠를 읽고 검색하며, 작성자는 책과 페이지를 작성·발행합니다.

> **현재 상태:** 인증·사용자 공간 API를 MVC 계층으로 분리하고 책 API의 생성·조회·수정·논리 삭제를 구현했습니다.
> 페이지·발행·검색·분류 기능과 운영 방안은 아직 구현되지 않았습니다.
> 원본: [WikiDocs형 블로그 플랫폼 설계안](https://app.notion.com/p/WikiDocs-41a2d703a2f881a7985eff5af6845fb1?source=copy_link)

## 서비스 설계

### 주요 기능

- 회원가입·로그인과 사용자별 독립 공간
- 책 생성·수정, 소개 및 공개 목록
- 계층형 목차, 순서 변경, Markdown 편집·미리보기
- 초안 저장과 공개 발행, 변경 이력 조회 및 과거 버전 복원
- 공개 책과 페이지 검색, 목차와 이전·다음 페이지를 제공하는 독서 화면
- 계층형 카테고리와 해시태그를 이용한 탐색·필터링

MVP에서는 책별 단독 작성을 제안하며 공동 작성·댓글·결제는 이후 확장합니다.

### 아키텍처와 데이터

```text
독자 / 작성자 → Nuxt 웹 → Express API → MySQL
                                     └→ Redis (재생성 가능한 캐시)
```

공개 화면은 SEO를 위해 서버 렌더링하고, 관리 화면은 로그인된 소유자에게 제공합니다.
MySQL은 원본 데이터이며 Redis만으로 공개 상태나 발행 여부를 판단하지 않습니다.

```text
사용자 1 ── 1 공간 1 ── N 책 1 ── N 페이지 1 ── N 페이지 버전
                                  └── 페이지는 부모 페이지를 가질 수 있음
```

주요 데이터는 사용자, 공간, 책, 페이지, 페이지 버전 및 서버 세션입니다.
페이지 부모는 같은 책에 속해야 하고, 목차 이동 시 자기 자신이나 하위 페이지로의
순환을 거부합니다. 공간과 책의 slug는 각각 해당 범위에서 유일하게 관리하며,
목차 순서 변경과 부모 이동은 트랜잭션과 동시 수정 충돌 검사로 처리합니다.

### 초안·발행·이력

- 초안과 발행본을 분리하고 초안 저장과 버전 생성을 같은 트랜잭션으로 처리합니다.
- 공개 조회·목차·검색에는 발행된 버전만 노출합니다. 발행 후 초안을 수정해도
  재발행 전에는 기존 발행본을 보여줍니다.
- revision을 검사해 오래된 저장은 409로 거부하고 사용자의 입력을 보존합니다.
- 과거 버전 복원은 초안에 새 이력을 만들며 즉시 공개하지 않습니다.
- 발행 취소 시 공개 조회·검색에서 제외하고, 캐시나 검색 색인이 있다면 함께 무효화합니다.
- 관리 API는 매 요청마다 소유권을 확인합니다. 타인의 초안과 이력은 존재 여부를
  드러내지 않도록 404로 처리하는 방향을 제안합니다.

### 카테고리와 태그

| 분류 | 관리 주체 | 대상 | 선택 수 |
| --- | --- | --- | --- |
| 플랫폼 카테고리 | 운영자 | 책 | 책당 1개 |
| 작성자 카테고리 | 작성자 | 책 | 책당 1개 |
| 책별 페이지 카테고리 | 책 소유자 | 해당 책의 페이지 | 페이지당 1개 |
| 해시태그 | 작성자 | 책·페이지 | 여러 개 |

카테고리는 계층형이고 목차와 별개이며, 태그는 작성자 공간별로 관리하는 단일 단계 분류입니다.
카테고리 부모는 같은 관리 범위에 속해야 하고 이동 시 순환을 거부합니다.
태그 이름은 공간 내에서 정규화해 중복을 방지하며 저장값에는 `#`을 제외하는 방식을 제안합니다.

페이지의 분류 변경은 초안에 반영하고 발행 시 카테고리와 태그도 버전에 고정합니다.
공개 검색과 필터에는 발행된 분류만 사용합니다. 플랫폼·작성자·책별 카테고리로
각 범위의 콘텐츠를 탐색하며, 전체 태그 검색에서는 정규화된 이름으로 공개 콘텐츠를
모을 수 있습니다. 공개 카테고리 트리처럼 재생성 가능한 데이터만 Redis에 캐시하고,
검색 결과 캐시는 발행 취소 반영 정책을 정한 뒤 도입합니다.

추가 데이터 모델은 `platform_categories`, `space_categories`,
`book_page_categories`, `tags`, `book_tags`, `page_version_tags`입니다.
다른 작성자의 분류·태그나 다른 책의 페이지 카테고리를 연결할 수 없어야 하며,
동시 이동에도 카테고리 트리의 무결성을 유지해야 합니다.

### 화면과 URL 초안

| 화면 | 경로 |
| --- | --- |
| 공개 책 목록·검색 | `/books` |
| 사용자 공간 | `/@{handle}` |
| 책 소개와 목차 | `/@{handle}/{bookSlug}` |
| 공개 페이지 | `/@{handle}/{bookSlug}/{pageId}` |
| 내 책 관리 | `/dashboard/books` |
| 페이지 편집 | `/dashboard/books/{bookId}/pages/{pageId}` |

공개 페이지 URL에는 변경 가능한 제목 대신 페이지 ID를 사용합니다.

### API 초안

| 구분 | 메서드·경로 | 역할 |
| --- | --- | --- |
| 공개 | `GET /api/v1/books` | 공개 책 목록 |
| 공개 | `GET /api/v1/search?q=...` | 공개 콘텐츠 검색 |
| 공개 | `GET /api/v1/books/{id}/toc` | 발행된 목차 |
| 공개 | `GET /api/v1/pages/{id}` | 발행된 페이지 |
| 공개 | `GET /api/v1/categories` | 플랫폼 카테고리 조회 |
| 관리 | `POST /api/v1/me/books` | 책 생성 |
| 관리 | `POST /api/v1/books/{id}/pages` | 초안 생성 |
| 관리 | `PATCH /api/v1/pages/{id}` | revision 검사 후 초안 및 분류 저장 |
| 관리 | `POST /api/v1/pages/{id}/publish` | 현재 초안 발행 |
| 관리 | `GET /api/v1/pages/{id}/versions` | 이력 조회 |
| 관리 | `POST /api/v1/pages/{id}/restore` | 과거 버전을 초안으로 복원 |
| 관리 | `PATCH /api/v1/books/{id}/toc` | 목차 이동·순서 변경 |
| 관리 | `POST /api/v1/me/categories` | 작성자 책 카테고리 생성 |
| 관리 | `POST /api/v1/books/{id}/categories` | 책별 페이지 카테고리 생성 |
| 관리 | `PATCH /api/v1/books/{id}` | 책 분류·태그 변경 |
| 공개 | `GET /api/v1/search?categoryId=...&tag=...` | 공개 콘텐츠 필터 검색 |

경로·입출력·오류 코드는 구현 전에 확정합니다. 카테고리 관리에는 관리 주체와
소유권 확인이 필요하며 운영자 인증 방식은 별도 설계가 필요합니다.

### 구현 단계

1. **기반·인증·사용자 공간:** 가입 후 공간 생성 및 타 사용자 관리 접근 차단
2. **책·초안·이력:** 페이지와 최초 이력의 원자적 생성, 충돌 시 입력 보존
3. **목차·발행·공개 읽기:** 계층 이동 검증 및 발행본만 공개
4. **공개 검색·독서 화면:** 초안 검색 제외, 목차와 이전·다음 이동
5. **운영·배포:** HTTPS, 백업·복구, 로그·모니터링 및 실제 API E2E 검증

기존 프로젝트의 테넌트 격리, 세션·CSRF·요청 제한, revision·트랜잭션·이력,
안전한 Markdown 렌더링 및 통합·브라우저 테스트 방식을 참고합니다.
기존 조직 내부 검색은 공개 발행본 검색에 맞게 새로 설계하며,
임시 HTTP 로그인 예외는 재사용하지 않고 공용 서비스는 HTTPS를 전제로 합니다.

### 미결 사항

- 사용자당 책 개수 제한과 책·페이지 발행 취소 방식
- 이미지 첨부 및 신고·운영자 대응 범위
- 책 분류 변경의 공개 반영 시점과 카테고리 삭제 시 연결 콘텐츠 처리
- 하위 카테고리 검색 포함 여부와 태그 이름의 대소문자 정규화 규칙

## 개발 환경

Nuxt, Express, MySQL, Redis를 Docker Compose로 실행합니다. 현재 설정은 개발용입니다.

### 실행

Docker와 Docker Compose가 필요합니다.

1. `.env.example`을 `.env`로 복사하고 두 비밀번호를 각각 안전한 임의 값으로 변경합니다.
2. `docker compose up --build -d`를 실행합니다.
3. 웹은 <http://localhost:3000>, API 상태 확인은 <http://localhost:4000/api/health>에서 확인합니다.
   웹의 `/api/health`도 개발 프록시를 통해 같은 API로 연결됩니다.
4. 중지는 `docker compose down`으로 합니다. MySQL 데이터 볼륨은 유지됩니다.

웹 앱과 API 소스는 컨테이너에 마운트되어 개발 중 변경을 반영합니다.
공유 라이브러리, 패키지나 설정 파일을 변경하면 `docker compose up --build -d`로 이미지를 다시 만듭니다.
MySQL과 Redis는 호스트에 포트를 공개하지 않습니다. `.env`의 MySQL 비밀번호는
최초 데이터베이스 생성 시 적용되며, 기존 볼륨이 있으면 변경만으로 갱신되지 않습니다.

### 1단계 인증·공간 API

| 메서드·경로 | 동작 |
| --- | --- |
| `POST /api/v1/auth/register` | `email`, `password`, `handle`로 가입하고 공간과 세션 생성 |
| `POST /api/v1/auth/login` | `email`, `password`로 로그인 |
| `GET /api/v1/auth/session` | 현재 사용자·공간과 CSRF 토큰 조회 |
| `POST /api/v1/auth/logout` | 현재 세션 삭제 |
| `GET /api/v1/spaces/{handle}` | 공개 공간 조회 |
| `PATCH /api/v1/spaces/{handle}` | 소유자의 공간 소개 `description` 변경 |

가입·로그인 시 HttpOnly 세션 쿠키와 CSRF 토큰을 발급합니다. 모든 변경 요청에는
설정된 `Origin`과 `Content-Type: application/json`이 필요하며, 로그아웃과 공간 변경에는
`X-CSRF-Token`도 필요합니다. 이메일은 소문자로 정규화하고, handle은 영문 소문자·숫자·
`_`·`-`로 3~30자입니다. 비밀번호는 12자 이상, UTF-8 기준 1024바이트 이하여야 합니다.
가입과 로그인에는 IP별 15분당 20회의 Redis 요청 제한이 적용됩니다.

Compose는 API 시작 전 MySQL 마이그레이션을 적용합니다. 로컬에서 직접 실행할 때는
필요한 MySQL 환경 변수를 설정하고 `pnpm --filter @wikiblog/api migrate`를 실행합니다.
개발 환경은 `http://localhost:3000`에서만 보안 쿠키 없이 동작하도록 설정되어 있습니다.
공개 서비스에서는 HTTPS `APP_ORIGIN`과 `COOKIE_SECURE=true`가 필요하며,
운영 배포·프록시 및 요청 제한 정책은 별도로 구성해야 합니다.

### 책 API (구현 중)

책은 생성 즉시 공개됩니다. 페이지 생성·발행과 목차, 검색, 카테고리·태그,
버전 이력·복원은 아직 지원하지 않습니다. 책 삭제 시 하위 페이지도 함께 논리 삭제하는
정책은 페이지 기능 구현 시 반드시 적용해야 합니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/books` | 삭제되지 않은 공개 책 목록 |
| `GET /api/v1/books/{id}` | 공개 책 상세 |
| `GET /api/v1/me/books` | 로그인한 사용자의 책 목록 |
| `POST /api/v1/me/books` | 책 생성 |
| `PATCH /api/v1/books/{id}` | 소유한 책 수정 |
| `DELETE /api/v1/books/{id}` | 소유한 책 논리 삭제 |

생성과 수정은 `slug`, `title`, `description`을 모두 받습니다. slug는 영문 소문자와
숫자를 하이픈으로 연결한 최대 80자이며 사용자 공간 내에서 유일합니다.
삭제된 책의 slug도 보존됩니다. 변경 요청은 인증·CSRF 규칙을 따르며 삭제 요청에도
`Content-Type: application/json`과 JSON 본문(예: `{}`)이 필요합니다.

### 공유 패키지

`libs/`의 각 디렉토리는 pnpm workspace 패키지이며 `@wikiblog/...`로 가져옵니다.

| 패키지 | 용도 |
| --- | --- |
| `@wikiblog/dto` | 웹과 API 사이의 요청·응답 타입 |
| `@wikiblog/entities` | DB 엔티티 타입 (백엔드 전용) |
| `@wikiblog/shared` | 웹과 API에서 사용할 수 있는 순수 함수 |
| `@wikiblog/types` | DTO 외 공통 인터페이스 |

예: `import type { SessionResponse } from '@wikiblog/dto'`,
`import { normalizeHandle } from '@wikiblog/shared'`. DTO 타입만으로 외부 입력이
검증되지는 않으므로 API에서 별도로 검증해야 합니다. 비밀번호 해시 등 DB 내부 정보는
DTO에 포함하지 않습니다.

로컬에서 `pnpm install` 후 `pnpm build:libs`로 패키지를 빌드합니다.
라이브러리 수정 후에는 다시 빌드해야 하며 Docker에서는 이미지를 다시 빌드해야 합니다.
전체 빌드는 `pnpm build`, API 타입 검사는 `pnpm typecheck`,
단위 테스트는 `pnpm --filter @wikiblog/api test`입니다.
Docker 실행 중 실연동 테스트는
`docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test`로 실행합니다.

### 디렉토리

```text
apps/
├── web/              # Nuxt 공개·작성자 화면
└── api/
    ├── src/          # API 계층 및 설정
    └── migrations/
libs/
├── dto/              # API 요청·응답 타입
├── entities/         # 백엔드 DB 모델
├── shared/           # 공통 함수
└── types/            # 공통 인터페이스
tests/
├── integration/      # API·MySQL·Redis 연동 테스트 예정
└── e2e/              # 독자·작성자 흐름 테스트 예정
docs/                 # API·데이터·운영 설계 문서 예정
```

빈 디렉토리는 Git에서 추적되지 않습니다.

## AI 개발 지침

`wikiblog` 폴더를 VS Code 워크스페이스로 열면 `.github/copilot-instructions.md`의
공통 지침과 `.github/instructions/`의 경로별 지침을 사용할 수 있습니다.
`.github/skills/`에는 백엔드·프론트엔드 기능과 발행·DB 작업 절차를,
`.github/agents/`에는 백엔드·프론트엔드 구현자와 읽기 전용 리뷰어를 정의했습니다.
`AGENTS.md`는 프로젝트 지침의 위치를 안내합니다.

가이드: [하네스 엔지니어링 실전 가이드](https://app.notion.com/p/Skills-Agents-4132d703a2f881a58352ea9faa6f639f?source=copy_link).
VS Code의 **Chat: Open Customizations**에서 지침·스킬·에이전트의 검색 여부를 확인하고,
새 대화에서 실제 작업과 리뷰를 시도해 적용 여부와 도구 사용을 확인합니다.
상위 저장소 폴더를 워크스페이스로 열 때는 중첩된 `.github`의 자동 검색을 보장하지 않습니다.
현재 CI 자동 검증은 구성하지 않았으며 지침과 에이전트는 테스트나 권한 통제의 대체물이 아닙니다.
