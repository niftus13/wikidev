# WikiBlog

사용자별 독립 공간에서 온라인 책과 페이지를 작성하고 공유하는 WikiDocs형 블랫폼입니다.
독자는 로그인 없이 공개된 콘텐츠를 읽고 검색하며, 작성자는 책과 페이지를 작성·발행합니다.

> **현재 상태:** 인증·책·페이지·분류 관리 API, 공개 검색·독서 화면과
> 회원가입·로그인·내 책 관리, 페이지 편집·발행, 목차 이동·이력 복원, 분류 관리 화면을 구현했습니다.
> 작성자 화면 중 목차·이력·분류 관리는 실제 API 흐름과 타입 검사·빌드로 확인했으나 실제 브라우저 검증은 남아 있습니다.
> 사용자 공간 화면과 운영 방안은 아직 구현되지 않았습니다.
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
- 발행 취소 API는 보류했습니다. 향후 도입 시 공개 조회·검색과 캐시·색인에도 반영해야 합니다.
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
태그 이름은 공간 내에서 앞뒤 공백과 선행 `#`을 제거하고 영문 대소문자를 무시하여 중복을 방지합니다.

페이지의 분류 변경은 초안에 반영하고 발행 시 카테고리 ID와 태그 연결을 버전에 고정합니다.
카테고리 이름이나 계층 변경은 해당 카테고리를 참조하는 발행본에도 반영됩니다.
공개 검색과 필터에는 발행된 분류만 사용합니다. 플랫폼·작성자·책별 카테고리로
각 범위의 콘텐츠를 탐색하며, 전체 태그 검색에서는 정규화된 이름으로 공개 콘텐츠를
모을 수 있습니다. 분류와 검색 결과 캐시는 아직 도입하지 않았습니다.

추가 데이터 모델은 범위별 분류를 함께 저장하는 `categories`와
`tags`, `book_tags`, `page_version_tags`입니다.
다른 작성자의 분류·태그나 다른 책의 페이지 카테고리를 연결할 수 없어야 하며,
동시 이동에도 카테고리 트리의 무결성을 유지해야 합니다.

### 화면과 URL

| 화면 | 경로 |
| --- | --- |
| 공개 책 목록 | `/` |
| 공개 검색 | `/search?q=...&categoryId=...&tag=...` |
| 책 소개와 목차 | `/@{handle}/{bookSlug}` |
| 공개 페이지 | `/@{handle}/{bookSlug}/{pageId}` |
| 회원가입·로그인 | `/register`, `/login` |
| 내 책 관리 | `/dashboard/books` |
| 페이지 목록 | `/dashboard/books/{bookId}/pages` |
| 페이지 편집 (페이지 분류 패널 포함) | `/dashboard/books/{bookId}/pages/{pageId}` |
| 분류 관리 (내 책 카테고리·태그) | `/dashboard/categories` |
| 책별 페이지 카테고리 관리 | `/dashboard/books/{bookId}/categories` |
| 사용자 공간 | `/@{handle}` (미구현, `GET /api/v1/spaces/{handle}` API만 있음) |

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
| 관리 | `PATCH /api/v1/pages/{id}` | revision 검사 후 초안 저장 |
| 관리 | `POST /api/v1/pages/{id}/publish` | 현재 초안 발행 |
| 관리 | `GET /api/v1/pages/{id}/versions` | 이력 조회 |
| 관리 | `POST /api/v1/pages/{id}/restore` | 과거 버전을 초안으로 복원 |
| 관리 | `PATCH /api/v1/books/{id}/toc` | 목차 이동·순서 변경 |
| 관리 | `POST /api/v1/me/categories` | 작성자 책 카테고리 생성 |
| 관리 | `POST /api/v1/books/{id}/categories` | 책별 페이지 카테고리 생성 |
| 관리 | `PATCH /api/v1/books/{id}/classification` | 책 분류·태그 변경 |
| 관리 | `PATCH /api/v1/pages/{id}/classification` | revision 검사 후 페이지 분류·태그 변경 |
| 공개 | `GET /api/v1/search?categoryId=...&tag=...` | 공개 콘텐츠 필터 검색 |

분류 관리에는 관리 주체와 소유권 확인이 필요하며 운영자 인증 방식은 별도 설계가 필요합니다.

### 구현 단계

1. **기반·인증·사용자 공간:** 가입 후 공간 생성 및 타 사용자 관리 접근 차단
2. **책·초안·이력:** 페이지와 최초 이력의 원자적 생성, 충돌 시 입력 보존
3. **목차·발행·공개 읽기:** 계층 이동 검증 및 발행본만 공개
4. **공개 검색·독서 화면:** 초안 검색 제외, 목차와 이전·다음 이동
5. **공개 분류:** 카테고리·태그 관리 API와 공개 검색 필터
6. **작성자 화면·운영·배포:** 관리 UI, HTTPS, 백업·복구, 로그·모니터링 및 실제 API E2E 검증

작성자 화면 중 회원가입·로그인, 책 생성·수정·삭제, 페이지 생성·편집·발행·삭제,
목차 이동, 이력 조회·복원과 분류 관리(카테고리·태그, 책·페이지 분류 지정)를 구현했습니다.
목차·이력·분류 관리 화면은 실제 API 흐름과 웹 타입 검사·빌드·단위 테스트로 확인했고 실제 브라우저 검증은
남아 있습니다. 사용자 공간 화면(`/@{handle}`)은 아직 구현하지 않았습니다.

기존 프로젝트의 테넌트 격리, 세션·CSRF·요청 제한, revision·트랜잭션·이력,
안전한 Markdown 렌더링 및 통합·브라우저 테스트 방식을 참고합니다.
기존 조직 내부 검색은 공개 발행본 검색에 맞게 새로 설계하며,
임시 HTTP 로그인 예외는 재사용하지 않고 공용 서비스는 HTTPS를 전제로 합니다.

### 미결 사항

- 사용자당 책 개수 제한과 책·페이지 발행 취소 방식
- 이미지 첨부 및 신고·운영자 대응 범위

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
웹 서버 코드, 공유 라이브러리, 패키지나 설정 파일을 변경하면 `docker compose up --build -d`로 이미지를 다시 만듭니다.
Nuxt 서버의 API 프록시 대상은 `API_PROXY_TARGET`으로 설정하며, 프로덕션 빌드 실행 시에는
런타임 환경 변수 `NUXT_API_PROXY_TARGET`으로 변경할 수 있습니다.
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

### 책 API

책은 생성 즉시 공개됩니다. 책을 논리 삭제하면 해당 책의 페이지도 같은 트랜잭션에서
논리 삭제됩니다. 분류 변경은 별도 분류 API를 이용합니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/books` | 삭제되지 않은 공개 책 목록 |
| `GET /api/v1/books/{id}` | 공개 책 상세 |
| `GET /api/v1/spaces/{handle}/books/{slug}` | 작성자 handle과 slug로 공개 책 상세 조회 |
| `GET /api/v1/me/books` | 로그인한 사용자의 책 목록 |
| `POST /api/v1/me/books` | 책 생성 |
| `PATCH /api/v1/books/{id}` | 소유한 책 수정 |
| `DELETE /api/v1/books/{id}` | 소유한 책 논리 삭제 |

생성과 수정은 `slug`, `title`, `description`을 모두 받습니다. slug는 영문 소문자와
숫자를 하이픈으로 연결한 최대 80자이며 사용자 공간 내에서 유일합니다.
삭제된 책의 slug도 보존됩니다. 변경 요청은 인증·CSRF 규칙을 따르며 삭제 요청에도
`Content-Type: application/json`과 JSON 본문(예: `{}`)이 필요합니다.
공개 책 목록·상세 응답에는 작성자 `handle`도 포함됩니다.

### 작성자 인증·책 관리 화면

주 메뉴의 **내 책 관리**에서 로그인하거나 회원가입할 수 있습니다. 로그인 후 내 책 목록,
책 생성·수정·삭제와 공개 책 이동을 이용할 수 있습니다. 책은 생성 즉시 공개되며,
주소 변경은 공개 URL을 바꿉니다. 삭제 확인 시 책과 모든 페이지가 논리 삭제되며
복구 API는 제공하지 않습니다.

관리 화면은 브라우저에서 세션을 조회하고 변경 요청에 CSRF 토큰을 전달합니다.
서버 API가 소유권을 검증하며, 세션 만료·중복 주소 등 요청 실패 시 폼 입력을 유지합니다.
세션이 만료된 경우 다른 탭에서 로그인하고 입력 내용을 복사해 보관한 뒤 화면을
새로고침해야 합니다.

### 작성자 페이지 관리 화면

내 책 관리에서 **페이지 관리**를 선택해 목차 순서와 발행 여부를 확인하고,
제목을 입력해 빈 최상위 초안을 만들 수 있습니다. 페이지 편집 화면은 Markdown
미리보기와 초안 저장을 제공하며, 저장된 revision만 발행합니다. 초안을 수정한 후
재발행하기 전에는 기존 발행본이 공개됩니다. 상위 페이지가 있는 경우 모든 상위
페이지가 발행되어야 합니다.

본문은 UTF-8 기준 12,000바이트 이하이고 전체 JSON 요청은 16KB로 제한됩니다.
revision 충돌·인증 오류 시 입력을 유지하며, 화면을 나가기 전에 미저장 내용을
확인합니다. 충돌 시 내용을 복사해 보관한 뒤 최신 초안을 다시 불러와야 합니다.
페이지 삭제에는 확인이 필요하며 모든 자손도 삭제됩니다.

페이지 목록에서 **이동**을 선택하면 상위 페이지와 형제 사이 순서를 바꿀 수 있습니다.
자기 자신과 하위 페이지는 상위 후보에서 제외됩니다. 목차 revision 충돌이나 발행된 페이지를
미발행 상위 아래로 옮기는 요청은 409 안내 후 **최신 목차 불러오기**로 다시 시작합니다.
페이지 편집 화면의 **이력 보기**에서 최신 revision 순 이력을 확인하고 과거 revision을
안전하게 렌더링한 Markdown으로 미리본 뒤 새 초안으로 복원할 수 있습니다. 복원은 분류도
함께 되돌리며, 제목·본문이나 분류에 미저장 변경이 있으면 복원을 막습니다. 복원 후에도
공개본은 재발행 전까지 유지되고, 오래된 revision으로 복원하면 409를 안내합니다.

### 작성자 분류 관리 화면

- **분류 관리** (`/dashboard/categories`, 내 책 관리 상단 링크): 내 책 카테고리를 트리로 보고
  생성·이름 변경·상위 이동·삭제하며, 태그를 만들고 삭제합니다. 상위 후보에서 자기 자신과
  하위 카테고리는 제외됩니다. 하위 카테고리나 연결된 콘텐츠(논리 삭제된 콘텐츠와 과거 이력 포함)가
  있는 카테고리, 연결된 태그의 삭제는 409로 거부되고 해제 방법을 안내합니다. `#Tag`와 `tag`처럼
  서버 정규화 기준으로 같은 태그는 409로 "이미 있는 태그"라고 안내합니다. 태그 이름 변경은 없습니다.
- **페이지 카테고리** (`/dashboard/books/{bookId}/categories`, 페이지 관리 화면 링크): 같은 화면
  구성으로 해당 책의 페이지 카테고리만 관리합니다.
- **책 분류** (내 책 관리의 각 책 **분류** 패널): 내 카테고리와 기존 태그(최대 50개)를 지정합니다.
  플랫폼 카테고리 필드는 `GET /api/v1/categories`가 1개 이상일 때만 보이며, 숨겨진 상태에서도
  불러온 플랫폼 카테고리 값을 그대로 다시 보냅니다. 책 분류는 저장 즉시 공개됩니다.
- **페이지 분류** (페이지 편집 화면의 **분류** 패널): 이 책의 페이지 카테고리와 기존 태그를 지정합니다.
  저장하면 초안 revision이 1 증가하고 새 이력이 생기며, 편집 화면의 revision도 응답으로 갱신되어
  이어지는 본문 저장·발행이 충돌하지 않습니다. 제목·본문에 미저장 변경이 있으면 분류 저장을 막고,
  409 충돌 시 선택을 유지한 채 **최신 초안 다시 불러오기**를 안내합니다. 페이지 분류는 다시 발행해야 공개됩니다.

분류 폼에서는 새 태그를 만들지 않고 **태그 관리로 이동** 링크를 제공합니다. 저장하지 않은 입력이
있는 상태로 이동하면 이탈 확인을 표시합니다. 세션 만료(401)는 "새 탭에서 로그인" 안내를,
다른 사용자의 책·페이지(404)는 "찾을 수 없거나 관리 권한이 없음" 안내를 표시합니다.

### 페이지 초안·이력 API

모든 페이지 초안과 이력은 로그인한 소유자만 조회할 수 있습니다. 다른 사용자의
책·페이지·이력에 대한 관리 접근은 404를 반환합니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/me/books/{bookId}/pages` | 소유한 책의 초안 목록 |
| `GET /api/v1/me/pages/{pageId}` | 소유한 페이지의 현재 초안 |
| `POST /api/v1/books/{bookId}/pages` | `title`, `body`로 초안과 최초 이력 생성 |
| `PATCH /api/v1/pages/{pageId}` | `title`, `body`, `revision`으로 초안 저장과 새 이력 생성 |
| `GET /api/v1/pages/{pageId}/versions` | 페이지 이력을 최신 revision 순으로 조회 |
| `POST /api/v1/pages/{pageId}/restore` | `versionId`, 현재 `revision`으로 과거 이력을 새 초안으로 복원 |
| `DELETE /api/v1/pages/{pageId}` | 페이지 논리 삭제 |

생성 시 revision은 1이며 저장과 복원 시 증가합니다. 오래된 revision은 409를
반환하고, 초안 변경과 이력 생성은 같은 트랜잭션으로 처리됩니다. 제목은 공백을 제외하고
비어 있지 않아야 하며 입력 기준 최대 200자, 본문은 UTF-8 기준 최대 12,000바이트입니다.
전체 JSON 요청 본문은 16KB로 제한되어 이스케이프 등으로 더 일찍 제한될 수 있습니다.
변경 요청은 기존 Origin·JSON·CSRF 규칙을 따릅니다. 부모 페이지를 삭제하면 모든 자손도
같은 트랜잭션에서 논리 삭제됩니다.

### 목차·발행·공개 읽기 API

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/me/books/{bookId}/toc` | 소유자의 전체 목차와 목차 revision |
| `PATCH /api/v1/books/{bookId}/toc` | 페이지의 부모와 형제 사이 순서 변경 |
| `POST /api/v1/pages/{pageId}/publish` | 현재 초안 revision을 검사해 발행 |
| `GET /api/v1/books/{bookId}/toc` | 발행된 페이지만 포함한 공개 목차 |
| `GET /api/v1/pages/{pageId}` | 공개 발행본 조회 |

관리 목차는 `{ revision, pages }`이며 각 항목은 `id`, `parentId`, `title`, `position`,
`published`를 가집니다. 공개 목차는 같은 순서의 항목 배열로, `published`는 제외하고
발행 당시 제목을 반환합니다. 항목은 부모보다 자식이 뒤에 오는 깊이 우선 순서이며
`position`은 같은 부모를 가진 항목 중 0부터 시작하는 순서입니다.

목차 변경은 `{ revision, pageId, parentId, position }`을 받습니다. `parentId: null`은
최상위이며, `position`은 이동할 페이지를 기존 위치에서 제거한 후 새 형제 목록에
삽입할 인덱스입니다. 현재 목차 revision은 관리 목차에서 확인합니다. 페이지 생성·삭제와
목차 이동은 revision을 증가시키며, 오래된 revision은 409로 거부합니다. 다른 책의
페이지를 부모로 지정하거나 순환을 만들 수 없습니다.

발행 요청은 `{ revision }`을 받으며 해당 revision의 이력을 공개본으로 지정합니다.
상위 페이지가 모두 발행되어야 발행할 수 있고, 발행된 페이지를 미발행 부모 아래로
이동할 수 없습니다. 발행 후 저장·복원한 초안은 재발행 전까지 공개본을 바꾸지 않습니다.
발행 취소와 삭제 복구 API는 제공하지 않습니다. 독서 화면은 공개 Markdown을 렌더링할 때
HTML 입력을 비활성화하고 출력 HTML을 정제합니다.

### 공개 검색 API

`GET /api/v1/search?q=...`는 공개 책 제목과 발행된 페이지의 제목·본문을 부분 문자열로
검색합니다. 검색어는 앞뒤 공백을 제외하고 1~200자이며 `%`, `_`, `!`는 와일드카드가 아닌
문자로 취급합니다. 삭제된 콘텐츠, 비활성 사용자의 콘텐츠와 미발행 초안은 검색하지 않습니다.
`q`, `categoryId`, `tag` 중 하나 이상을 지정해야 하며 여러 조건은 AND로 결합합니다.
카테고리는 자손을 포함합니다. 책의 플랫폼·작성자 카테고리는 그 책과 발행 페이지에
적용되고, 책별 페이지 카테고리는 페이지에만 적용됩니다. 태그는 각 결과에 직접 연결된
태그와 일치해야 하며 책의 태그는 페이지에 상속되지 않습니다.
제목·ID 순으로 최대 50개를 반환하며 페이지네이션은 아직 없습니다.
각 결과는 `type`, `id`, `title`, `bookId`, `bookSlug`, `bookTitle`, `handle`, `excerpt`를
포함합니다. `excerpt`는 책 소개 또는 발행 본문의 앞 160자입니다. 현재 검색은 MySQL
부분 일치 검색이므로 데이터가 늘어나면 검색 인덱스와 성능 검토가 필요합니다.

### 카테고리·태그 API

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/categories` | 플랫폼 카테고리 조회 |
| `GET /api/v1/categories/discover` | 공개 콘텐츠에 연결된 카테고리와 조상, 플랫폼 카테고리 조회 |
| `GET`, `POST /api/v1/me/categories` | 내 책 카테고리 목록·생성 |
| `PATCH`, `DELETE /api/v1/me/categories/{categoryId}` | 내 책 카테고리 수정·삭제 |
| `GET /api/v1/me/books/{bookId}/categories` | 책의 페이지 카테고리 목록 |
| `POST /api/v1/books/{bookId}/categories` | 책의 페이지 카테고리 생성 |
| `PATCH`, `DELETE /api/v1/books/{bookId}/categories/{categoryId}` | 책의 페이지 카테고리 수정·삭제 |
| `GET`, `POST /api/v1/me/tags` | 내 태그 목록·생성 |
| `DELETE /api/v1/me/tags/{tagId}` | 내 태그 삭제 |
| `GET /api/v1/me/books/{bookId}/classification` | 내 책의 분류 ID·태그 ID 조회 |
| `GET /api/v1/me/pages/{pageId}/classification` | 페이지 초안의 revision·분류 ID·태그 ID 조회 |
| `GET /api/v1/books/{bookId}/classification` | 공개 책의 분류·태그 조회 |
| `GET /api/v1/pages/{pageId}/classification` | 발행 페이지의 분류·태그 조회 |
| `PATCH /api/v1/books/{bookId}/classification` | 책 분류·태그 변경 |
| `PATCH /api/v1/pages/{pageId}/classification` | 페이지 초안 분류·태그 변경 및 새 이력 생성 |

카테고리 생성·수정 본문은 `{ "name": "...", "parentId": null }`이며 최상위의
`parentId`는 null입니다. 태그 생성 본문은 `{ "name": "#태그" }`입니다.
책 분류 변경은 `{ "platformCategoryId": null, "spaceCategoryId": null, "tagIds": [] }`,
페이지 분류 변경은 `{ "revision": 1, "categoryId": null, "tagIds": [] }` 형태로 모든
필드를 전달합니다. 페이지 revision 충돌은 409이며 책 분류는 즉시 공개됩니다.
카테고리와 태그 이름은 최대 100자, 콘텐츠의 태그는 최대 50개입니다.
하위 카테고리 또는 콘텐츠에 연결된 카테고리와 콘텐츠에 연결된 태그는 삭제할 수
없습니다. 논리 삭제된 콘텐츠와 과거 페이지 이력의 연결도 삭제를 막습니다.
플랫폼 카테고리는 조회만 가능하며 초기 데이터와 운영자 관리 API는 제공하지 않습니다.
작성자 분류 관리 화면은 [작성자 분류 관리 화면](#작성자-분류-관리-화면)을 참고합니다.

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
웹 타입 검사는 `pnpm --filter @wikiblog/web typecheck`, Markdown·목차·카테고리 트리
단위 테스트는 `pnpm --filter @wikiblog/web test`입니다.
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

Claude Code에서는 `wikiblog` 폴더에서 실행하면 `CLAUDE.md`가 공통 지침을 import하고,
`.claude/rules`·`.claude/skills`가 `.github` 원본을 심볼릭 링크로 참조합니다.
서브에이전트는 도구 형식이 달라 `.claude/agents`에 별도로 정의하며 본문은 `.github/agents`와 함께 갱신합니다.

가이드: [하네스 엔지니어링 실전 가이드](https://app.notion.com/p/Skills-Agents-4132d703a2f881a58352ea9faa6f639f?source=copy_link).
VS Code의 **Chat: Open Customizations**에서 지침·스킬·에이전트의 검색 여부를 확인하고,
새 대화에서 실제 작업과 리뷰를 시도해 적용 여부와 도구 사용을 확인합니다.
상위 저장소 폴더를 워크스페이스로 열 때는 중첩된 `.github`의 자동 검색을 보장하지 않습니다.
현재 CI 자동 검증은 구성하지 않았으며 지침과 에이전트는 테스트나 권한 통제의 대체물이 아닙니다.
