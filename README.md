# WikiBlog

사용자별 독립 공간에서 온라인 책과 페이지를 작성하고 공유하는 WikiDocs형 플랫폼입니다.
독자는 로그인 없이 공개된 콘텐츠를 읽고 검색하며 작성자는 책과 페이지를 작성·발행합니다.

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

공개 화면은 SEO를 위해 서버 렌더링하고 관리 화면은 로그인된 소유자에게 제공합니다.
MySQL은 원본 데이터이며 Redis만으로 공개 상태나 발행 여부를 판단하지 않습니다.

```text
사용자 1 ── 1 공간 1 ── N 책 1 ── N 페이지 1 ── N 페이지 버전
                                  └── 페이지는 부모 페이지를 가질 수 있음
```

주요 데이터는 사용자, 공간, 책, 페이지, 페이지 버전 및 서버 세션입니다.
페이지 부모는 같은 책에 속해야 하고 목차 이동 시 자기 자신이나 하위 페이지로의
순환을 거부합니다. 공간과 책의 slug는 각각 해당 범위에서 유일하게 관리하며,
목차 순서 변경과 부모 이동은 트랜잭션과 동시 수정 충돌 검사로 처리합니다.

### 초안·발행·이력

- 초안과 발행본을 분리하고 초안 저장과 버전 생성을 같은 트랜잭션으로 처리합니다.
- 공개 조회·목차·검색에는 발행된 버전만 노출합니다. 발행 후 초안을 수정해도
  재발행 전에는 기존 발행본을 보여줍니다.
- revision을 검사해 오래된 저장은 409로 거부하고 사용자의 입력을 보존합니다.
- 과거 버전 복원은 초안에 새 이력을 만들며 즉시 공개하지 않습니다.
- 발행 취소는 페이지 단위이며 발행된 하위 페이지도 같은 트랜잭션에서 함께 취소합니다. 초안과 이력은 남고,
  다시 발행하면 현재 초안 revision으로 발행합니다. 캐시·색인이 없어 공개 조회·검색에 즉시 반영됩니다.
- 관리 API는 매 요청마다 소유권을 확인합니다. 타인의 초안과 이력은 존재 여부를
  드러내지 않도록 404로 처리하는 방향을 제안합니다.

### 카테고리와 태그

| 분류 | 관리 주체 | 대상 | 선택 수 |
| --- | --- | --- | --- |
| 플랫폼 카테고리 | 운영자 | 책 | 책당 1개 |
| 작성자 카테고리 | 작성자 | 책 | 책당 1개 |
| 책별 페이지 카테고리 | 책 소유자 | 해당 책의 페이지 | 페이지당 1개 |
| 해시태그 | 작성자 | 책·페이지 | 여러 개 |

카테고리는 계층형이고 목차와 별개이며 태그는 작성자 공간별로 관리하는 단일 단계 분류입니다.
카테고리 부모는 같은 관리 범위에 속해야 하고 이동 시 순환을 거부합니다.
태그 이름은 공간 내에서 앞뒤 공백과 선행 `#`을 제거하고 영문 대소문자를 무시하여 중복을 방지합니다.

페이지의 분류 변경은 초안에 반영하고 발행 시 카테고리 ID와 태그 연결을 버전에 고정합니다.
카테고리 이름이나 계층 변경은 해당 카테고리를 참조하는 발행본에도 반영됩니다.
공개 검색과 필터에는 발행된 분류만 사용합니다. 플랫폼·작성자·책별 카테고리로
각 범위의 콘텐츠를 탐색하며 전체 태그 검색에서는 정규화된 이름으로 공개 콘텐츠를
모을 수 있습니다. 분류와 검색 결과 캐시는 아직 도입하지 않았습니다.

추가 데이터 모델은 범위별 분류를 함께 저장하는 `categories`와
`tags`, `book_tags`, `page_version_tags`입니다.
다른 작성자의 분류·태그나 다른 책의 페이지 카테고리를 연결할 수 없어야 하며,
동시 이동에도 카테고리 트리의 무결성을 유지해야 합니다.

### 화면과 URL

| 화면 | 경로 |
| --- | --- |
| 공개 책 목록 | `/` |
| 사용자 공간 (소개와 공개 책 목록) | `/@{handle}` |
| 공개 검색 | `/search?q=...&categoryId=...&tag=...` |
| 책 소개와 목차 | `/@{handle}/{bookSlug}` |
| 공개 페이지 | `/@{handle}/{bookSlug}/{pageId}` |
| 회원가입·로그인 | `/register`, `/login` |
| 내 책 관리 | `/dashboard/books` |
| 페이지 목록 | `/dashboard/books/{bookId}/pages` |
| 페이지 편집 (페이지 분류 패널 포함) | `/dashboard/books/{bookId}/pages/{pageId}` |
| 분류 관리 (내 책 카테고리·태그) | `/dashboard/categories` |
| 책별 페이지 카테고리 관리 | `/dashboard/books/{bookId}/categories` |

공개 페이지 URL에는 변경 가능한 제목 대신 페이지 ID를 사용합니다.

사용자 공간 `/@{handle}`은 `GET /api/v1/spaces/{handle}`과 `GET /api/v1/spaces/{handle}/books`를
서버 렌더링합니다. 소개는 일반 텍스트로 줄바꿈만 유지하며(HTML·Markdown은 글자 그대로 표시),
없는 공간·비활성 공간·잘못된 handle은 HTTP 404, 그 외 오류는 503과 다시 시도 버튼입니다.
대문자나 앞뒤 공백이 있는 handle(`/@Foo`)은 `normalizeHandle` 결과인 `/@foo`로 301 리다이렉트합니다.
책·페이지 URL(`/@{handle}/{bookSlug}`)의 대소문자는 정규화하지 않습니다(대문자는 404).
소유자에게 보이는 **소개 편집**·**내 책 관리** 링크는 브라우저에서 세션의 handle과 비교해 표시하며
서버 렌더링 HTML에는 포함하지 않습니다. 홈 책 카드·검색 결과·책 소개·독서 화면의 `@handle`과
이동 경로(breadcrumb)는 공간으로 연결됩니다. 책 카드와 검색 결과는 제목 링크가 카드 전체를 덮고
작성자 링크를 별도로 두어 링크가 중첩되지 않습니다.

**헤더 로그인:** 헤더 오른쪽은 비로그인이면 **로그인** 버튼, 로그인 상태면 계정 메뉴(아바타 이니셜과 `@handle`)를
보여줍니다. 계정 메뉴는 **내 공간**(`/@{handle}`)·**내 책 관리**·**로그아웃**을 제공하며 Esc·바깥 클릭으로 닫힙니다.
로그인 상태는 브라우저에서 `GET /api/v1/auth/session`으로 조회하고(서버 렌더링 HTML에는 세션 정보 없음),
조회 전에는 같은 크기의 빈 자리를 둡니다. 로그아웃은 CSRF 토큰과 함께 `POST /api/v1/auth/logout`을 보내며,
관리 화면(`/dashboard/...`)에서는 먼저 홈으로 이동한 뒤(미저장 변경 확인에서 취소하면 로그아웃하지 않음) 로그아웃합니다.
공간 화면의 소유자 링크도 같은 로그인 상태를 써서 로그아웃 즉시 사라집니다.

**검색 화면:** 상단의 큰 검색 입력에 입력하면 약 300ms 뒤 자동으로 검색합니다(`router.replace`로 URL 쿼리만 바꿔
방문 기록을 쌓지 않음). Enter는 즉시 검색하고 한글 등 IME 조합 중에는 조합이 끝날 때까지 검색하지 않습니다.
지우기 버튼은 검색어를 비우고 초기 안내로 돌아갑니다. 카테고리는 선택 즉시, 태그는 **태그 적용**으로 반영됩니다.
결과는 "총 N개의 결과"와 함께 작성자(아바타 이니셜·`@handle`, 공간 링크), 유형 배지(책·페이지), 제목,
요약(최대 3줄), 페이지의 책 제목을 보여줍니다. 새 검색을 불러오는 동안 이전 결과를 흐리게 유지하며,
50개를 채우면 최대 개수 안내를 표시합니다. URL로 직접 연 검색은 서버 렌더링됩니다. 검색 화면에서는 헤더 검색을 숨깁니다.

### API 초안

| 구분 | 메서드·경로 | 역할 |
| --- | --- | --- |
| 공개 | `GET /api/v1/books` | 공개 책 목록 |
| 공개 | `GET /api/v1/spaces/{handle}/books` | 사용자 공간의 공개 책 목록 |
| 공개 | `GET /api/v1/search?q=...` | 공개 콘텐츠 검색 |
| 공개 | `GET /api/v1/books/{id}/toc` | 발행된 목차 |
| 공개 | `GET /api/v1/pages/{id}` | 발행된 페이지 |
| 공개 | `GET /api/v1/categories` | 플랫폼 카테고리 조회 |
| 관리 | `POST /api/v1/me/books` | 책 생성 |
| 관리 | `POST /api/v1/books/{id}/pages` | 초안 생성 |
| 관리 | `PATCH /api/v1/pages/{id}` | revision 검사 후 초안 저장 |
| 관리 | `POST /api/v1/pages/{id}/publish` | 현재 초안 발행 |
| 관리 | `POST /api/v1/pages/{id}/unpublish` | 페이지와 하위 페이지 발행 취소 |
| 관리 | `POST /api/v1/me/images` | 이미지 업로드(원본 바이트) |
| 공개 | `GET /api/v1/images/{id}` | 업로드 이미지 조회 |
| 관리 | `GET /api/v1/pages/{id}/versions` | 이력 조회 |
| 관리 | `POST /api/v1/pages/{id}/restore` | 과거 버전을 초안으로 복원 |
| 관리 | `PATCH /api/v1/books/{id}/toc` | 목차 이동·순서 변경 |
| 관리 | `POST /api/v1/me/categories` | 작성자 책 카테고리 생성 |
| 관리 | `POST /api/v1/books/{id}/categories` | 책별 페이지 카테고리 생성 |
| 관리 | `PATCH /api/v1/books/{id}/classification` | 책 분류·태그 변경 |
| 관리 | `PATCH /api/v1/pages/{id}/classification` | revision 검사 후 페이지 분류·태그 변경 |
| 공개 | `GET /api/v1/search?categoryId=...&tag=...` | 공개 콘텐츠 필터 검색 |

분류 관리에는 관리 주체와 소유권 확인이 필요하며 운영자 인증 방식은 별도 설계가 필요합니다.

### 운영 정책

페이지 단위 발행 취소와 MySQL 이미지 첨부를 지원하고 플랫폼 카테고리는 마이그레이션 시드로 관리합니다. 책 개수 제한·계정 기준 로그인 제한·
신고 기능·삭제 복구 API는 두지 않습니다(운영자는 사용자 비활성화와 런북의 수동 절차로 대응).

고아 이미지(본문에서 빠지거나 삭제된 페이지의 이미지)는 아직 정리하지 않습니다.

## 개발 환경

Nuxt, Express, MySQL, Redis를 Docker Compose로 실행합니다. `compose.yaml`·`Dockerfile`은 개발용이고,
운영용은 `compose.prod.yaml`·`Dockerfile.prod`입니다([운영 배포](#운영-배포)).

### 실행

Docker와 Docker Compose가 필요합니다.

1. `.env.example`을 `.env`로 복사하고 두 비밀번호를 각각 안전한 임의 값으로 변경합니다.
2. `docker compose up --build -d`를 실행합니다.
3. 웹은 <http://localhost:3000>, API 상태 확인은 <http://localhost:4000/api/health>에서 확인합니다.
   웹의 `/api/health`도 웹 서버의 API 프록시를 통해 같은 API로 연결됩니다.
4. 중지는 `docker compose down`으로 합니다. MySQL 데이터 볼륨은 유지됩니다.

웹 앱과 API 소스는 컨테이너에 마운트되어 개발 중 변경을 반영합니다.
웹 서버 코드, 공유 라이브러리, 패키지나 설정 파일을 변경하면 `docker compose up --build -d`로 이미지를 다시 만듭니다.
Nuxt 서버의 API 프록시 대상은 `API_PROXY_TARGET`으로 설정하며 프로덕션 빌드 실행 시에는
런타임 환경 변수 `NUXT_API_PROXY_TARGET`으로 변경할 수 있습니다.

#### API 프록시와 클라이언트 주소

- 웹의 `/api/**`는 개발(`nuxt dev`)과 운영 모두 `apps/web/server/api/[...path].ts` 한 곳에서 API로 전달합니다
  (`nitro.devProxy`는 쓰지 않습니다).
- 프록시는 클라이언트가 보낸 `X-Forwarded-*`, `X-Real-IP`, `Forwarded`를 버리고 자신이 직접 본 연결 주소
  하나로 `X-Forwarded-For`를 새로 씁니다. 개발 서버에서는 Nitro 워커가 유닉스 소켓 뒤에 있어 주소를 직접 알 수
  없으므로, 개발 서버 첫 hop(`nuxt.config.ts`의 `devServerHandlers`)이 같은 방식으로 헤더를 다시 씁니다.
  SSR 내부 호출은 운영 빌드에서 연결 주소가 없어 `X-Forwarded-For` 없이 전달됩니다(웹 서버 주소로 집계).
  `WEB_TRUST_PROXY`가 없으면(개발 기본값) 웹이 첫 hop이라고 보고 이렇게 동작합니다. CDN은 아직 두지 않았습니다(도입하면
  신뢰 체인을 다시 설계해야 합니다). 운영에서는 호스트 nginx가 첫 hop이고
  웹은 nginx 뒤에 있으므로 아래 `WEB_TRUST_PROXY`로 nginx 쪽 주소만 믿습니다.
- 웹의 `WEB_TRUST_PROXY`(런타임 `NUXT_WEB_TRUST_PROXY`)는 `X-Forwarded-For`를 믿을 웹 앞단 프록시 주소입니다. 허용 값과
  trust-all 거부 규칙은 API `TRUST_PROXY`와 같고(IP·CIDR·`loopback`·`linklocal`·`uniquelocal`, 잘못된 값이면 웹 서버가 시작하지 않음),
  비어 있으면 지금처럼 소켓 주소만 씁니다. 소켓 주소가 이 목록에 있을 때만 XFF를 Express와 같은 `proxy-addr` 규칙으로 해석해
  **오른쪽부터 신뢰하지 않는 첫 주소**를 클라이언트로 정하고 API에는 그 주소 하나로 XFF를 다시 씁니다(IP 형식이 아니면 소켓 주소).
  목록 밖의 연결이 보낸 XFF는 버립니다. 개발 서버 첫 hop(`devServerHandlers`)도 같은 값을 따릅니다.
- 프록시 시간 제한은 기본 30초이며 `NUXT_API_PROXY_TIMEOUT_MS`(밀리초, 양의 정수)로 바꿉니다.
  넘으면 `504 {"error":"Upstream timeout"}`을 반환합니다. 잘못된 값이면 `/api` 요청이 500으로 실패합니다.
  Compose에서는 `.env`의 `NUXT_API_PROXY_TIMEOUT_MS`가 웹 컨테이너로 전달됩니다.
- API의 `TRUST_PROXY`는 `X-Forwarded-For`를 믿을 프록시 주소입니다. 쉼표로 구분한 IP, CIDR
  (접두사 1 이상), `loopback`, `linklocal`, `uniquelocal`만 허용합니다. 비어 있으면 프록시를 믿지 않고
  직전 연결 주소로 요청 제한을 집계합니다. `true`, 숫자 hop 수, `*`, `0.0.0.0/0`처럼 모든 주소를 믿는 값이나
  형식이 잘못된 값은 시작 시 오류입니다.
- **위조 위험**: 신뢰 범위에 든 주소는 `X-Forwarded-For`로 임의의 클라이언트 주소를 주장할 수 있습니다.
  신뢰 범위가 넓으면(예: `uniquelocal`) 같은 사설망의 다른 컨테이너·호스트가 요청 제한 키를 바꿔
  제한을 우회할 수 있으므로, 실제 프록시 주소만 지정합니다.
- Compose는 웹과 API 사이에 전용 네트워크 `web-api`(`WEB_API_SUBNET`, 기본 `10.231.0.0/29`)를 만들고
  웹 컨테이너에 고정 주소 `WEB_PROXY_IP`(기본 `10.231.0.6`, 대역의 마지막 주소)를 줍니다. API의
  `TRUST_PROXY`는 이 주소 하나입니다. 같은 호스트에서 Compose 프로젝트를 둘 이상(예: git worktree) 띄우면
  `.env`에서 두 값을 겹치지 않게 바꿉니다(예: `10.231.0.8/29`, `10.231.0.14`). 이 대역이 호스트의 다른
  네트워크와 겹치면 네트워크 생성이 실패하므로 그때도 두 값을 바꿉니다.
- 호스트에서 `127.0.0.1:4000`으로 API를 직접 호출하면 API는 Compose 기본 네트워크의 게이트웨이 주소
  (확인 시 `172.21.0.1`)에서 온 연결로 보며 이 주소는 신뢰 범위 밖이므로 `X-Forwarded-For`는 무시됩니다.
  호스트에서 웹(3000)으로 보낸 요청은 `web-api` 네트워크의 게이트웨이 주소(확인 시 `10.231.0.9`)로 집계되므로,
  로컬 개발에서는 호스트의 모든 브라우저 요청이 하나의 키를 공유합니다.
MySQL과 Redis는 호스트에 포트를 공개하지 않습니다. `.env`의 MySQL 비밀번호는
최초 데이터베이스 생성 시 적용되며 기존 볼륨이 있으면 변경만으로 갱신되지 않습니다.

### 운영 배포

운영은 AWS EC2 인스턴스 안의 Docker이고 호스트 nginx(Let's Encrypt)가 첫 hop입니다. CDN은 보류했습니다.
절차(인스턴스 준비, 인증서, 보안 그룹, 첫·정기 배포, 롤백, 로그, 백업, 운영 SQL)는 런북 [deploy/README.md](deploy/README.md)에 있습니다.

```text
클라이언트 → nginx(443, XFF = $remote_addr로 덮어씀) → 127.0.0.1:3000 → web(NUXT_WEB_TRUST_PROXY = Docker 게이트웨이)
          → api(TRUST_PROXY = web 고정 주소) → mysql·redis(비공개)
```

- `Dockerfile.prod`: 빌드 단계(`pnpm install --frozen-lockfile` → `build:libs` → `nuxt build` → `pnpm deploy --prod`로 API 운영 의존성만)와
  실행 target `web`(`.output`만, `node .output/server/index.mjs`), `api`(`src`·`migrations`·운영 `node_modules`, `node src/index.ts`).
  Node 24, `node` 사용자(non-root)로 실행하고 파일은 root 소유입니다.
- `compose.prod.yaml`: web만 `127.0.0.1:3000`에 공개하고 api·mysql·redis는 공개하지 않습니다. 모든 서비스 `restart: unless-stopped`·
  헬스 체크·로그 순환(json-file 10 MiB × 5), web·api는 읽기 전용 루트·`cap_drop: ALL`·`no-new-privileges`. API는 `COOKIE_SECURE=true`,
  `APP_ORIGIN=https://<APP_DOMAIN>`, 마이그레이션은 시작 명령에 넣지 않습니다. MySQL 데이터는 이름 있는 볼륨 `mysql-data`입니다.
  web은 `web-api` 네트워크 하나에만 연결하고 게이트웨이를 `WEB_GATEWAY_IP`(기본 `10.231.0.1`)로 고정해 `NUXT_WEB_TRUST_PROXY`와 맞춥니다.
  호스트에서 공개 포트로 들어온 연결은 이 게이트웨이 주소로 보입니다(로컬 재현 실측: 대역 `10.231.0.16/29`에서 `10.231.0.17`).
- `.env.production.example`: 도메인, 비밀번호, 네트워크 대역·게이트웨이·웹 주소. 인스턴스에서 `.env.production`(권한 600)으로 복사하며 저장소·이미지에 넣지 않습니다.
- `deploy/nginx/wikiblog.conf`: 443 TLS 1.2+·HSTS, 80 리다이렉트와 `/.well-known/acme-challenge/`, 본문 상한 64k(이미지 업로드만 3m),
  시간 제한 60초, `/_nuxt/*`만 `public, max-age=31536000, immutable`.
- `deploy/deploy.sh <태그|커밋>`: 체크아웃 → 커밋 태그로 이미지 빌드 → 일회성 migrate(실패 시 중단) → `up -d --wait` → `/api/health`·SSR `/` 확인 →
  실패 시 이전 태그 이미지로 롤백(스키마는 되돌리지 않음).
- **신뢰의 한계**: 게이트웨이 주소를 믿으므로 호스트의 프로세스와 같은 호스트의 다른 Docker 네트워크 컨테이너(Docker가 게이트웨이 주소로 SNAT)는
  `X-Forwarded-For`로 요청 제한 키를 바꿀 수 있습니다. 호스트 접근 통제(보안 그룹·SSH/SSM)와 호스트에 다른 컨테이너를 두지 않는 것이 전제입니다.

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
설정된 `Origin`과 `Content-Type: application/json`이 필요하며 로그아웃과 공간 변경에는
`X-CSRF-Token`도 필요합니다. 이메일은 소문자로 정규화하고 handle은 영문 소문자·숫자·
`_`·`-`로 3~30자입니다. 비밀번호는 12자 이상, UTF-8 기준 1024바이트 이하여야 합니다.
가입과 로그인에는 IP별 15분당 20회의 Redis 요청 제한이 적용됩니다. IP는 Express `request.ip`이며
(`TRUST_PROXY`, [API 프록시와 클라이언트 주소](#api-프록시와-클라이언트-주소) 참고), IPv4-mapped IPv6
(`::ffff:a.b.c.d`)는 IPv4로 정규화합니다. 이메일 등 계정 기준 제한은 없습니다.

Compose는 API 시작 전 MySQL 마이그레이션을 적용합니다. 로컬에서 직접 실행할 때는
필요한 MySQL 환경 변수를 설정하고 `pnpm --filter @wikiblog/api migrate`를 실행합니다.
개발 환경은 `http://localhost:3000`에서만 보안 쿠키 없이 동작하도록 설정되어 있습니다.
공개 서비스에서는 HTTPS `APP_ORIGIN`과 `COOKIE_SECURE=true`가 필요하며,
운영 배포(nginx, HTTPS, 신뢰 체인)는 [운영 배포](#운영-배포)와 [런북](deploy/README.md)을 참고합니다.

### 책 API

책은 생성 즉시 공개됩니다. 책을 논리 삭제하면 해당 책의 페이지도 같은 트랜잭션에서
논리 삭제됩니다. 분류 변경은 별도 분류 API를 이용합니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/v1/books` | 삭제되지 않은 공개 책 목록 |
| `GET /api/v1/books/{id}` | 공개 책 상세 |
| `GET /api/v1/spaces/{handle}/books` | 사용자 공간의 삭제되지 않은 공개 책 목록 |
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

공간 책 목록(`GET /api/v1/spaces/{handle}/books`)은 `GET /api/v1/books`와 같은 `PublicBookDto[]`
형태와 정렬(`created_at DESC, id DESC`)로 해당 공간의 삭제되지 않은 책만 반환합니다.
handle은 공간 조회 API와 같이 앞뒤 공백을 제거하고 소문자로 정규화합니다. 형식이 잘못되었거나
공간이 없거나 소유자가 비활성이면 `404`이고 공간은 있지만 책이 없으면 `200 []`입니다.
페이지네이션은 없습니다. 책 상세 `GET /api/v1/spaces/{handle}/books/{slug}`는 지금처럼
소문자 handle만 받습니다.

### 작성자 인증·책 관리 화면

헤더의 **로그인** 버튼이나 주 메뉴의 **내 책 관리**에서 로그인하거나 회원가입할 수 있습니다.
로그인·회원가입 화면은 가운데 카드 형태로 입력별 아이콘, 비밀번호 보기/숨기기 버튼, 처리 중 표시를 제공하며
실패 시 입력을 유지하고 상태 코드별 안내(400·401·409·429·그 외)를 보여줍니다. 성공하면 `/dashboard/books`로 이동합니다. 로그인 후 내 책 목록,
책 생성·수정·삭제와 공개 책 이동을 이용할 수 있습니다. 책은 생성 즉시 공개되며,
주소 변경은 공개 URL을 바꿉니다. 삭제 확인 시 책과 모든 페이지가 논리 삭제되며
복구 API는 제공하지 않습니다.

관리 화면은 브라우저에서 세션을 조회하고 변경 요청에 CSRF 토큰을 전달합니다.
세션이 만료된 경우 다른 탭에서 로그인하고 입력 내용을 복사해 보관한 뒤 화면을
새로고침해야 합니다. 서버 API가 소유권을 검증하며 세션 만료·중복 주소 등 요청 실패 시 폼 입력을 유지합니다.

내 책 관리 상단의 **내 공간** 패널에서 handle과 공개 공간 링크를 확인하고 공간 소개를 편집합니다
(`/dashboard/books?space=edit`로 열면 편집 폼이 바로 열립니다). 소개는 일반 텍스트로 최대 500자이며
글자 수는 서버와 같이 `Array.from(text).length`(코드 포인트) 기준으로 셉니다. 초과하면 저장 버튼이
비활성화되고 서버의 400도 안내합니다. 저장은 `PATCH /api/v1/spaces/{handle}`에 CSRF 토큰과 함께
보내고 응답으로 화면을 갱신하며 공개 공간에 즉시 반영됩니다. 실패하거나 세션이 만료되어도 입력은
유지되고 401이면 **새 탭에서 로그인** 링크를 보여줍니다. 공간 소개나 책 분류 패널에 저장하지 않은
변경이 있으면 화면 이동·새로고침 전에 확인합니다.

### 작성자 페이지 관리 화면

내 책 관리에서 **페이지 관리**를 선택해 목차 순서와 발행 여부를 확인하고,
제목을 입력해 빈 최상위 초안을 만들 수 있습니다. 페이지 편집 화면은 Markdown
미리보기와 초안 저장을 제공하며 저장된 revision만 발행합니다. 상위 페이지가 있는 경우 모든 상위
페이지가 발행되어야 합니다. 초안을 수정한 후
재발행하기 전에는 기존 발행본이 공개됩니다.

본문은 UTF-8 기준 12,000바이트 이하이고 전체 JSON 요청은 16KB로 제한됩니다.
revision 충돌·인증 오류 시 입력을 유지하며 화면을 나가기 전에 미저장 내용을
확인합니다. 충돌 시 내용을 복사해 보관한 뒤 최신 초안을 다시 불러와야 합니다.
페이지 삭제에는 확인이 필요하며 모든 자손도 삭제됩니다.

**발행 취소**: 페이지 목록의 발행된 행과 페이지 편집 화면(발행된 페이지)에 **발행 취소** 버튼이 있습니다.
누르면 확인 패널이 열리고 포커스가 **발행 취소 확인** 버튼으로 옮겨집니다. 패널은 관리 목차의 `published`로 센
하위 발행 페이지 수를 "이 페이지와 하위 발행 페이지 N개가 공개에서 빠집니다"로 안내합니다(편집 화면은 패널을 열 때
관리 목차를 다시 불러오고 실패하면 수 없이 안내합니다). 성공하면 응답 `unpublishedPageIds`로 목록의 발행 상태를
갱신하고 함께 취소된 하위 페이지 수를 알립니다(이미 미발행이면 상태만 갱신). 요청 중에는 버튼이 잠겨 중복 요청이
없습니다. 발행 취소는 초안을 바꾸지 않으므로 편집 화면에 저장하지 않은 변경이 있어도 할 수 있고 그 경우 확인 패널에
"저장하지 않은 본문 변경은 그대로 남습니다"를 덧붙이며 입력은 유지됩니다. 다시 공개하려면 상위부터 **발행**합니다.

**이미지 넣기**: 편집 화면 본문 칸 위의 이미지 버튼(아이콘, `aria-label="이미지 넣기"`), 클립보드 붙여넣기(이미지 항목만,
글자 붙여넣기는 기본 동작), 끌어다 놓기(놓을 수 있는 동안 칸 테두리 강조)로 넣습니다. 버튼은 PNG·JPEG·WebP·GIF만 고르는
파일 선택(`multiple`)을 엽니다. 브라우저가 먼저 형식(4종)·크기(2MB)·빈 파일을 검사하고 업로드 후 본문이 12,000바이트를
넘게 되면 올리지 않고 안내합니다. 통과한 파일마다 커서 위치에 `![업로드 중: 이름](uploading:<임시 id>)` 자리를 별도 문단으로
넣고(끌어다 놓기는 칸에 포커스가 없으면 본문 끝), 한 장씩 순서대로 `POST /api/v1/me/images`로 원본 바이트를 보낸 뒤
`![alt](/api/v1/images/<id>)`로 바꿉니다. alt는 파일 이름에서 확장자를 빼고 `[`·`]`·`\`·줄바꿈을 정리한 값이며 비면
"이미지"입니다. 업로드 중에는 버튼에 스피너가 돌고 `role="status"`로 "이미지 n/m 업로드 중"을 알리며 초안 저장·발행이
잠깁니다(본문 입력은 계속 가능, 화면 이탈은 막음). 그 사이 사용자가 임시 자리를 지우면 결과를 넣지 않습니다. 실패하면 임시
자리를 지우고 파일별로 안내합니다: 형식(400/415) "PNG·JPEG·WebP·GIF만", 크기(413) "2MB 이하", 용량(409) "이미지 저장
공간(50MB)", 401·403은 입력을 그대로 두고 **새 탭에서 로그인** 링크, 그 밖은 다시 시도. 업로드 결과로 바뀐 본문은 일반
입력과 같이 미저장 변경(이탈 확인)으로 취급되며 저장해야 초안에 반영됩니다(저장하지 않은 이미지는 고아 이미지로 남음).
미리보기와 공개 화면은 같은 `renderMarkdown`을 쓰므로 내부 이미지만 `loading="lazy"`로 표시되고 임시 자리·외부 이미지는
보이지 않습니다. 이미지 크기는 `.markdown-body img { max-width: 100% }`로 본문 폭에 맞춥니다.

페이지 목록에서 **이동**을 선택하면 상위 페이지와 형제 사이 순서를 바꿀 수 있습니다.
자기 자신과 하위 페이지는 상위 후보에서 제외됩니다. 목차 revision 충돌이나 발행된 페이지를
미발행 상위 아래로 옮기는 요청은 409 안내 후 **최신 목차 불러오기**로 다시 시작합니다.
페이지 편집 화면의 **이력 보기**에서 최신 revision 순 이력을 확인하고 과거 revision을
안전하게 렌더링한 Markdown으로 미리본 뒤 새 초안으로 복원할 수 있습니다. 복원은 분류도
함께 되돌리며 제목·본문이나 분류에 미저장 변경이 있으면 복원을 막습니다. 복원 후에도
공개본은 재발행 전까지 유지되고 오래된 revision으로 복원하면 409를 안내합니다.

### 작성자 분류 관리 화면

- **분류 관리** (`/dashboard/categories`, 내 책 관리 상단 링크): 내 책 카테고리를 트리로 보고
  생성·이름 변경·상위 이동·삭제하며 태그를 만들고 삭제합니다. 상위 후보에서 자기 자신과
  하위 카테고리는 제외됩니다. 하위 카테고리나 연결된 콘텐츠(논리 삭제된 콘텐츠와 과거 이력 포함)가
  있는 카테고리, 연결된 태그의 삭제는 409로 거부되고 해제 방법을 안내합니다. `#Tag`와 `tag`처럼
  서버 정규화 기준으로 같은 태그는 409로 "이미 있는 태그"라고 안내합니다. 태그 이름 변경은 없습니다.
- **페이지 카테고리** (`/dashboard/books/{bookId}/categories`, 페이지 관리 화면 링크): 같은 화면
  구성으로 해당 책의 페이지 카테고리만 관리합니다.
- **책 분류** (내 책 관리의 각 책 **분류** 패널): 내 카테고리와 기존 태그(최대 50개)를 지정합니다.
  플랫폼 카테고리 필드는 `GET /api/v1/categories`가 1개 이상일 때만 보이며 숨겨진 상태에서도
  불러온 플랫폼 카테고리 값을 그대로 다시 보냅니다. 책 분류는 저장 즉시 공개됩니다.
- **페이지 분류** (페이지 편집 화면의 **분류** 패널): 이 책의 페이지 카테고리와 기존 태그를 지정합니다.
  저장하면 초안 revision이 1 증가하고 새 이력이 생기며 편집 화면의 revision도 응답으로 갱신되어
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
반환하고 초안 변경과 이력 생성은 같은 트랜잭션으로 처리됩니다. 제목은 공백을 제외하고
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
| `POST /api/v1/pages/{pageId}/unpublish` | 페이지와 발행된 모든 자손의 발행 취소 |
| `GET /api/v1/books/{bookId}/toc` | 발행된 페이지만 포함한 공개 목차 |
| `GET /api/v1/pages/{pageId}` | 공개 발행본 조회 |

관리 목차는 `{ revision, pages }`이며 각 항목은 `id`, `parentId`, `title`, `position`,
`published`를 가집니다. 공개 목차는 같은 순서의 항목 배열로, `published`는 제외하고
발행 당시 제목을 반환합니다. 항목은 부모보다 자식이 뒤에 오는 깊이 우선 순서이며
`position`은 같은 부모를 가진 항목 중 0부터 시작하는 순서입니다.

목차 변경은 `{ revision, pageId, parentId, position }`을 받습니다. `parentId: null`은
최상위이며 `position`은 이동할 페이지를 기존 위치에서 제거한 후 새 형제 목록에
삽입할 인덱스입니다. 현재 목차 revision은 관리 목차에서 확인합니다. 페이지 생성·삭제와
목차 이동은 revision을 증가시키며 오래된 revision은 409로 거부합니다. 다른 책의
페이지를 부모로 지정하거나 순환을 만들 수 없습니다.

발행 요청은 `{ revision }`을 받으며 해당 revision의 이력을 공개본으로 지정합니다.
상위 페이지가 모두 발행되어야 발행할 수 있고 발행된 페이지를 미발행 부모 아래로
이동할 수 없습니다. 발행 후 저장·복원한 초안은 재발행 전까지 공개본을 바꾸지 않습니다.
발행 취소는 본문 `{}`(JSON)로 요청하며 소유자·CSRF가 필요합니다. 다른 사용자의 페이지는 404입니다.
요청한 페이지와 발행된 모든 자손의 공개본 지정을 같은 트랜잭션에서 해제하고
`200 { "id": "<pageId>", "unpublishedPageIds": ["<pageId>", "<자손 ID>", ...] }`를 반환합니다.
`unpublishedPageIds`는 이번 요청으로 취소된 페이지만 요청 페이지부터 얕은 깊이 순으로 담으며,
이미 미발행이면 빈 배열로 200을 반환합니다(멱등). 초안·이력·목차 revision은 바뀌지 않고 관리 목차의
`published`, 공개 조회·목차·분류 조회, 검색과 분류 필터에서 즉시 빠집니다. 다시 발행하려면 상위부터
기존 발행 API로 발행합니다. 삭제 복구 API는 제공하지 않습니다. 독서 화면은 공개 Markdown을 렌더링할 때
HTML 입력을 비활성화하고 출력 HTML을 정제합니다.

### 공개 검색 API

`GET /api/v1/search?q=...`는 공개 책 제목과 발행된 페이지의 제목·본문을 부분 문자열로
검색합니다. 검색어는 앞뒤 공백을 제외하고 1~200자이며 `%`, `_`, `!`는 와일드카드가 아닌
문자로 취급합니다. 삭제된 콘텐츠, 비활성 사용자의 콘텐츠와 미발행 초안은 검색하지 않습니다.
`q`, `categoryId`, `tag` 중 하나 이상을 지정해야 하며 여러 조건은 AND로 결합합니다.
카테고리는 자손을 포함합니다. 책의 플랫폼·작성자 카테고리는 그 책과 발행 페이지에
적용되고 책별 페이지 카테고리는 페이지에만 적용됩니다. 태그는 각 결과에 직접 연결된
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
플랫폼 카테고리는 조회만 가능하며 운영자 관리 API는 제공하지 않습니다. 최상위 6개(개발, 데이터·AI, 디자인,
비즈니스, 학습·교양, 일상·기타)를 `007_platform_categories.sql`이 고정 UUID
(`8c1f0a00-0000-4000-8000-00000000000{1..6}`, 위 순서)로 시드하며 다시 실행해도 같은 결과가 됩니다.
조회 순서는 기존 규칙대로 이름순입니다. 바꿀 때는 새 migration을 추가합니다(적용된 migration은 체크섬으로 검증).
작성자 분류 관리 화면은 [작성자 분류 관리 화면](#작성자-분류-관리-화면)을 참고합니다.

### 이미지 API

이미지는 MySQL `images` 테이블(`006_images.sql`)에 원본 바이트로 저장합니다. 외부 저장소·리사이즈·썸네일은 없습니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `POST /api/v1/me/images` | 로그인한 사용자의 공간에 이미지 1장 업로드 |
| `GET /api/v1/images/{id}` | 이미지 공개 조회(인증 불필요) |

업로드는 JSON이 아니라 **원본 바이트**를 본문으로 보냅니다. 이 경로만 전역 JSON 규칙(`application/json`, 16KB)에서
빠지며 Origin 검사는 같고 세션·CSRF(`X-CSRF-Token`)와 선언 형식은 본문을 읽기 전에 확인합니다.
`Content-Type`은 `image/png`, `image/jpeg`, `image/webp`, `image/gif` 중 하나이고 서버가 파일 시그니처(매직 바이트)로
실제 형식을 판정해 선언과 같을 때만 저장합니다. `Content-Encoding` 압축 본문은 받지 않습니다.
성공하면 `201 { "id", "url": "/api/v1/images/{id}", "contentType", "byteSize" }`를 반환합니다.
본문 Markdown에는 `![설명](/api/v1/images/{id})`로 넣습니다.

| 상태 | 오류 메시지 | 조건 |
| --- | --- | --- |
| 401 | `Authentication required` | 세션 없음·만료 |
| 403 | `Invalid origin` / `Invalid CSRF token` | Origin 불일치 / CSRF 토큰 없음·불일치 |
| 415 | `Unsupported image type` | 선언 `Content-Type`이 허용 4종이 아님(SVG `image/svg+xml`, `application/json`, 없음 포함) |
| 415 | `Unsupported request body encoding` | `Content-Encoding`으로 압축한 본문 |
| 400 | `Image body is empty` | 빈 본문 |
| 400 | `Image content does not match Content-Type` | 시그니처가 선언 형식과 다름(위장 파일, PNG로 선언한 SVG 등) |
| 413 | `Request body too large` | 2 MiB(2,097,152바이트) 초과 |
| 409 | `Image storage quota exceeded` | 업로드 후 공간 총량이 50 MiB(52,428,800바이트)를 넘음 |

총량은 같은 공간의 업로드를 공간 행 잠금(`SELECT ... FOR UPDATE`)으로 직렬화한 트랜잭션 안에서 계산하므로,
동시 업로드가 함께 상한을 넘기지 않습니다. 가입·로그인 요청 제한은 바뀌지 않았고 업로드 자체에는 요청 제한이 없습니다
(남용은 크기·총량 상한으로 제한).

조회는 UUID 형식이 아니거나(대문자 포함), 없거나, 소유자가 비활성(`users.status = 'disabled'`)이면 404(`Image not found`,
`Cache-Control: no-store`)입니다. 성공 응답 헤더는 다음과 같습니다.

- `Content-Type`: 저장한 형식, `Content-Length`, `Content-Disposition: inline`
- `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`
- `Cache-Control: public, max-age=31536000, immutable` (이미지는 수정·삭제 API가 없어 내용이 바뀌지 않습니다)

웹 서버의 `/api` 프록시를 거치면 다른 헤더는 그대로 전달되지만 `Content-Length` 대신 chunked 전송이 됩니다.

웹 Markdown 렌더러(`renderMarkdown`)는 `img`의 `src`가 정확히 `/api/v1/images/<소문자 UUID>`일 때만 남기고
(`loading="lazy"`, `decoding="async"` 부여) 외부 http(s)·프로토콜 상대·`data:` 등 그 밖의 이미지는 alt까지 제거합니다.
링크(`a`)의 외부 주소는 그대로 허용합니다. 업로드 후 본문에서 빠지거나 페이지가 삭제된 이미지(고아 이미지)는
MVP에서 지우지 않습니다. 이미지 개별 삭제 API도 없습니다. 운영 영향(백업·디스크·nginx 본문 상한)은
[런북](deploy/README.md)을 참고합니다.

### CI

GitHub Actions 워크플로는 **저장소 루트**의 `.github/workflows/wikiblog-ci.yml`입니다.
Git 루트가 `wikis/`이고 GitHub은 루트의 `.github/workflows/`만 읽으므로 워크플로를 루트에 둡니다.
모든 명령은 `wikiblog/`에서 실행합니다.

- **실행 조건**: `wikiblog/**` 또는 워크플로 파일을 바꾼 PR, 같은 경로의 `main` push, 수동 실행(`workflow_dispatch`).
  경로 필터에 걸리지 않는 PR에는 상태 검사가 생기지 않으므로, 브랜치 보호의 필수 검사로 지정할 때 고려합니다.
  같은 브랜치·PR에서 새 실행이 시작되면 이전 실행은 취소됩니다. 권한은 `contents: read`뿐입니다.
- **환경**: `ubuntu-24.04`, Node 24(Docker 이미지와 같음, `package.json`의 `engines.node`는 `>=24`),
  pnpm은 `packageManager`의 10.30.0, pnpm 저장소 캐시, `pnpm install --frozen-lockfile`.
- **정적 검사·단위 job**: `pnpm build:libs` → `pnpm typecheck` → `pnpm --filter @wikiblog/web typecheck` →
  `pnpm --filter @wikiblog/api build` → API 테스트(통합 테스트는 건너뜀) → 웹 테스트 → `pnpm --filter @wikiblog/web build`.
- **통합 job**: Redis 7.4는 서비스 컨테이너, MySQL 8.4는 job 안에서 `openssl rand`로 만든 일회용 비밀번호로
  띄웁니다(서비스 컨테이너 설정은 job 시작 전에 정해져 job에서 만든 값을 넘길 수 없기 때문입니다. 포트는 러너의
  `127.0.0.1`에만 엽니다). 비밀번호는 `::add-mask::`로 로그에서 가리고 저장소 시크릿은 쓰지 않습니다.
  마이그레이션 → API(`node src/index.ts`)를 백그라운드로 실행 → `/api/health`가 `ok`가 될 때까지 최대 60초
  대기(넘거나 API가 종료되면 API 로그를 출력하고 실패) → `INTEGRATION_TESTS=1`로 API 테스트를 실행합니다.
  `APP_ORIGIN=http://localhost:3000`, `COOKIE_SECURE=false`이며 `TRUST_PROXY`는 두지 않습니다.
- **건너뛴 테스트 금지**: 통합 job은 `node --test` 요약 줄(`ℹ tests N`, `ℹ skipped N`)을 읽어 요약이 없거나,
  실행한 테스트가 0개이거나, `skipped`가 0이 아니면 실패합니다. 환경 변수가 빠져 통합 테스트가 조용히 건너뛰는 것을
  막기 위해서입니다. 단위 job에서는 통합 테스트가 건너뛰는 것이 정상이므로 이 검사를 하지 않습니다.
- **운영 이미지 job**(`production-image`): 일회용 비밀번호로 운영 환경 파일을 만들고 `deploy/deploy.sh`(체크아웃 없이 현재 커밋)로
  `Dockerfile.prod` 두 target을 빌드(레지스트리 push 없음) → 마이그레이션 → `compose.prod.yaml` 기동 → 헬스 체크를 한 뒤,
  공개 포트(`127.0.0.1:3000`)로 운영 빌드 SSR(`/`·`/login`·`/register`·`/search`·`/dashboard/books` 200, 없는 공간 404),
  `/api/health`, `/_nuxt/*` 자산을 확인합니다(지난 `@lucide/vue` SSR 500 같은 운영 빌드 결함을 잡기 위함).
  3000 외의 포트가 공개되면 실패하고 끝나면 스택과 볼륨을 지웁니다.
- 요청 제한은 끄지 않습니다. 실행마다 새 Redis를 쓰며 현재 통합 테스트 한 번의 가입은 14회·로그인은 2회로
  IP별 15분 20회 제한 안에 있습니다. 가입하는 테스트를 늘려 20회를 넘으면 429로 실패하므로 그때 다시 검토합니다.

로컬에서 같은 검사를 돌리는 방법(정적 검사·단위 job과 같은 순서):

```bash
pnpm install --frozen-lockfile
pnpm build:libs && pnpm typecheck && pnpm --filter @wikiblog/web typecheck
pnpm --filter @wikiblog/api build
pnpm --filter @wikiblog/api test && pnpm --filter @wikiblog/web test
pnpm --filter @wikiblog/web build
```

개발 호스트의 Node가 24가 아니면 결과가 다를 수 있으므로, 깨끗한 `node:24` 컨테이너에 소스를 복사해
(호스트의 `node_modules`는 쓰지 않음) 위 명령을 실행하는 것이 CI와 가장 가깝습니다.
통합 job은 Compose 스택에서 `docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test`를
실행하고 끝의 요약에서 `ℹ skipped 0`을 확인하면 같은 범위를 검사합니다(Compose는 `TRUST_PROXY`를 설정하는 점만 다릅니다).

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
웹 타입 검사는 `pnpm --filter @wikiblog/web typecheck`, Markdown·목차·카테고리 트리·검색 쿼리·페이지 메타
단위 테스트는 `pnpm --filter @wikiblog/web test`입니다.

### 웹 화면 스타일

- 웹은 Nuxt 4와 기존 전역 CSS(`apps/web/app/assets/css/main.css`)에 **Tailwind CSS v4**(`@tailwindcss/vite`)를 함께 씁니다.
  Tailwind는 **preflight(base reset) 없이** theme·utilities 레이어만 가져오고 기존 규칙은 `base`·`components` 레이어에 둡니다.
  색·반경·컨트롤 높이는 main.css의 CSS 변수(`--accent`, `--line`, `--muted`, `--input` 등)를 `@theme inline`으로 연결해
  `text-accent`·`border-line`·`rounded-control`·`h-control` 같은 유틸리티와 기존 클래스가 같은 값을 씁니다.
  기존 `.container`와 이름이 겹치는 Tailwind 유틸리티는 만들지 않습니다.
- 아이콘은 **`@lucide/vue`**(Lucide의 Vue 패키지, 이전 이름 `lucide-vue-next`)를 컴포넌트로 가져옵니다. 외부 네트워크가 필요 없습니다.
- 현재 Tailwind로 작성한 화면은 헤더 계정 영역, 로그인·회원가입, 검색 화면입니다. 나머지는 기존 클래스를 씁니다.

### 웹 head·파비콘·외부 CSS/JS

- **head 기본값**은 `apps/web/nuxt.config.ts`의 `app.head`(`lang="ko"`, charset, viewport, 기본 title·description, `theme-color`, 파비콘·manifest link)에 있습니다.
  **제목 규칙**은 `app.vue`의 `titleTemplate` 한 곳에서 정합니다: `화면 제목 — WikiBlog`, 제목이 없으면 `WikiBlog — 책으로 만나는 지식`.
- 화면별 메타는 **`usePageMeta({ title, description, noindex, type })`**(`app/composables/usePageMeta.ts`)로만 넣습니다. 제목에 `— WikiBlog`를 붙이지 않습니다.
  description은 일반 텍스트만 받아 공백을 정리하고 160자(코드 포인트)로 자르며 비면 사이트 기본 설명을 씁니다. `og:title`·`og:description`·`og:type`·`og:site_name`·`twitter:card`가 함께 들어갑니다.
  관리·인증 화면과 오류 상태(공간·책·페이지)는 `noindex`입니다. 책은 소개, 페이지는 본문 앞부분(Markdown에서 글자만 추출, `markdownPlainText`), 공간은 소개를 description으로 씁니다.
  순수 규칙(`formatTitle`·`joinTitle`·`metaDescription`)은 `app/utils/meta.ts`에 있고 `pnpm --filter @wikiblog/web test`로 검사합니다.
  `og:url`·`og:image`는 사이트 절대 주소 설정이 없어 아직 넣지 않습니다.
- **파비콘**: 원본은 헤더 브랜드 마크와 같은 디자인의 `apps/web/public/favicon.svg`(글꼴 없이 path로 그린 W)입니다.
  `favicon.ico`(16·32·48), `apple-touch-icon.png`(180, 꽉 찬 사각형), `icon-192.png`·`icon-512.png`(`site.webmanifest`)는 생성물이며,
  SVG를 바꾸면 `apps/web`에서 다음으로 다시 만듭니다(공식 Playwright 이미지의 Chromium으로 렌더링, npm 설치 불필요).
  ```bash
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
    mcr.microsoft.com/playwright:v1.65.1-noble node scripts/generate-icons.mjs
  ```
- **CSS·JS는 외부 파일로 head에 넣습니다.** `features.inlineStyles: false`로 운영 빌드의 CSS는 `<link rel="stylesheet" href="/_nuxt/entry.*.css">`이고,
  JS는 `<script type="module" src="/_nuxt/*.js">`와 `modulepreload`입니다. 엔트리 import map 인라인 스크립트도 끕니다(`experimental.entryImportMap: false`).
  앱 코드에 인라인 `style=""`·`<style>` 블록·`innerHTML` 스크립트를 쓰지 않습니다(깊이 들여쓰기는 `.depth-0`~`.depth-6` 클래스).
  Nuxt가 넣는 인라인은 두 개만 남습니다: SSR 데이터 `<script type="application/json" id="__NUXT_DATA__">`(실행되지 않는 데이터)와
  `window.__NUXT__.config` 설정 스크립트(빌드마다 내용이 고정, Nuxt 4.6에서 끌 수 있는 설정 없음). `nuxt dev`는 Vite가 CSS를 JS로 주입하므로 확인은 운영 빌드로 합니다.
- 운영 빌드에서 `@lucide/vue`는 `build.transpile`로 번들에 포함합니다. 외부 CJS로 두면 별도 vue 인스턴스를 불러 SSR이 500으로 실패합니다.
Docker 실행 중 실연동 테스트는
`docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test`로 실행합니다.

### 디렉토리

```text
deploy/               # 운영 배포 스크립트·nginx 설정·런북(README.md)
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
