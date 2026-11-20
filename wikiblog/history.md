# 개발 기록 및 체크포인트

기준: 2026-11-20. 이 문서는 현재까지의 구현과 이후 작업을 구분합니다.
상세 실행 방법과 API 계약은 [README.md](./README.md)를 참고합니다.

## 현재 위치

**인증·책·페이지·분류 관리 API, 공개 독서 화면, 작성자 화면(인증·책·페이지·목차·이력·분류 관리)과
사용자 공간 화면(`/@{handle}`, 내 공간 소개 편집)을 구현했습니다.**
MVP 콘텐츠 백엔드(발행 취소·이미지 업로드/조회·플랫폼 카테고리 시드)와 화면(발행 취소 버튼, 편집 화면 이미지 넣기)을 구현하고 Playwright Docker로 브라우저 검증했습니다.
작성자 화면과 사용자 공간 화면은 실제 API 흐름(curl)·SSR 응답과 웹 타입 검사·빌드·단위 테스트로 확인했으나,
작업 환경에 실행 가능한 브라우저가 없어 실제 브라우저 검증은 남아 있습니다.
2026-11-19에 Tailwind·헤더 로그인·인증·검색 화면을 개편하면서 Playwright Docker 이미지로 주요 화면의 실제 브라우저 검증(스크린샷·키보드·모바일)을 처음 수행했습니다.
운영은 프록시 신뢰 경계와 요청 제한(운영 1), CI 워크플로(운영 2, GitHub Actions 실행 통과), 운영 배포 구성(운영 이미지·Compose·호스트 nginx·배포 스크립트·런북, 로컬 재현)을 구현했고, 실제 EC2 배포와 E2E·모니터링은 남아 있습니다.
사용자 공간 화면 요구사항은 [docs/checkpoints/user-space-ui.md](docs/checkpoints/user-space-ui.md)에 있습니다.
완료한 작성자 화면 요구사항은 [docs/checkpoints/author-management-ui.md](docs/checkpoints/author-management-ui.md)에 있습니다.

## 체크포인트

### 2026-11-16: 개발 환경과 프로젝트 구성

- Nuxt 웹, Express API, MySQL, Redis를 Docker Compose 개발 환경으로 구성했습니다.
- pnpm workspace와 `libs/dto`, `libs/entities`, `libs/shared`, `libs/types`를 구성했습니다.
- API 상태 확인과 웹의 개발용 API 프록시를 연결했습니다.
- 웹 화면은 기본 페이지와 세션 composable만 있으며 블로그 화면은 없습니다.

### 2026-11-16~17: 인증·사용자 공간

- 회원가입 시 사용자·공간·세션을 생성하고 로그인, 세션 조회, 로그아웃을 구현했습니다.
- 공개 공간 조회와 소유자의 공간 소개 수정을 구현했습니다.
- 비밀번호 해시, HttpOnly 세션 쿠키, Origin·CSRF 검사, Redis 기반 가입·로그인 요청 제한을 적용했습니다.
- 인증·공간 코드를 route → controller → service → repository로 분리했습니다.
- MySQL migration 실행기와 `001_auth.sql`을 추가했습니다.

### 2026-11-17: AI 개발 지침

- 프로젝트 범위의 공통·백엔드·프론트엔드·테스트 지침을 작성했습니다.
- 백엔드·프론트엔드 구현 및 발행·DB 작업을 위한 스킬 4개와 구현·리뷰 에이전트 3개를 작성했습니다.
- 백엔드 MVC, 서비스, 공통 코드 재사용, entity·DTO·interface 사용 원칙을 지침에 반영했습니다.
- 지침의 실제 VS Code 로딩과 에이전트 동작은 별도 확인이 필요합니다. CI는 아직 구성하지 않았습니다.

### 2026-11-17: 책 CRUD

- `002_books.sql`과 책 entity·DTO, route·controller·service·repository를 추가했습니다.
- 공개 책 목록·상세, 내 책 목록, 소유자의 생성·수정·논리 삭제 API를 구현했습니다.
- 책은 생성 즉시 공개되고, 삭제된 책은 공개 목록·상세에서 제외됩니다.
- 책 slug는 공간 내에서 유일하며 삭제 후에도 기존 slug가 보존됩니다.
- 책 생성·수정에는 `slug`, `title`, `description`이 모두 필요합니다.

### 체크포인트: 페이지 초안·이력

- 페이지 초안 CRUD와 소유자 전용 이력 조회·과거 버전의 초안 복원을 구현했습니다.
- 최초 생성, 저장, 복원 시 이력을 함께 기록하고 오래된 revision은 409로 거부합니다.
- 책과 페이지 삭제는 논리 삭제이며, 책 삭제 시 페이지도 같은 트랜잭션에서 삭제합니다.
- 페이지 발행본, 계층과 순서, 공개 조회는 아직 구현하지 않았습니다.

### 2026-11-17: 목차·발행·공개 읽기

- 목차의 부모 이동·순서 변경과 revision 충돌, 같은 책 범위 및 순환 검사를 구현했습니다.
- 상위 페이지가 모두 발행되어야 자식을 발행하거나 발행된 페이지를 그 아래로 이동할 수 있습니다.
- 발행 버전을 초안과 분리하고 공개 페이지와 발행된 항목만 포함하는 공개 목차를 구현했습니다.
- 부모 페이지 논리 삭제 시 모든 자손도 같은 트랜잭션에서 논리 삭제합니다.
- 발행 취소와 삭제 복구는 보류합니다.

### 2026-11-17: 공개 검색·독서 화면

- 공개 책 제목과 발행된 페이지 제목·본문의 부분 일치 검색을 구현했습니다.
- 서버 렌더링되는 책 목록·검색·책 소개·독서 화면과 목차·이전·다음 이동을 구현했습니다.
- Markdown 입력의 HTML을 비활성화하고 출력 HTML을 정제합니다.
- GitHub Docs와 WikiDocs의 문서 탐색 경험을 참고하고 화면 일관성을 유지하도록 프론트엔드 지침을 갱신했습니다.
- 카테고리·태그는 사용자 선택에 따라 다음 단계로 분리했습니다.

### 체크포인트: 카테고리·태그와 공개 검색 필터

- 계층형 작성자·책별 카테고리와 공간별 태그의 소유자 관리 API를 구현했습니다.
- 책 분류는 즉시 공개되고 페이지 분류는 revision을 가진 이력에 저장되어 재발행 시 공개됩니다.
- 하위 카테고리 또는 콘텐츠·과거 이력에서 참조하는 분류와 태그의 삭제를 거부합니다.
- 공개 검색에 검색어·카테고리·태그 AND 필터와 하위 카테고리 검색을 추가했습니다.
- 검색 화면 필터와 책·페이지의 분류 링크를 추가했습니다.
- 플랫폼 카테고리 관리·초기 데이터와 작성자 관리 UI는 후속 단계로 남겼습니다.

### 2026-11-18: 작성자 인증·책 관리 화면

- 회원가입·로그인과 세션 확인·로그아웃을 화면에 연결했습니다.
- 내 책 목록과 생성·수정·삭제, 공개 책 이동을 구현했습니다.
- 책 생성 즉시 공개, 주소 변경 영향 및 책과 페이지 삭제를 안내하고 삭제 확인을 받습니다.
- 중복 주소, 인증 만료 등 오류에 입력을 보존하고 중복 제출을 방지합니다.
- 페이지 편집·발행·목차·이력과 분류 관리 화면은 후속 단계입니다.

### 2026-11-18: 페이지 작성·발행 화면

- 내 책에서 페이지 목록으로 이동하여 빈 초안을 만들고 Markdown으로 편집·미리보기합니다.
- 초안 저장과 발행을 분리하고 미저장 변경은 발행하지 않습니다.
- 충돌 시 입력을 보존하고 미저장 내용을 가진 채 화면을 떠날 때 확인합니다.
- 페이지와 자손의 삭제 확인, 발행 여부와 공개 페이지 이동을 추가했습니다.
- 목차 변경, 이력·복원과 분류 관리 화면은 후속 단계입니다.

### 2026-11-18: 작성자 화면 — 목차·이력 정리와 분류 관리 UI

- 요구사항: [docs/checkpoints/author-management-ui.md](docs/checkpoints/author-management-ui.md) (Q1~Q3 추천안 A).
- A. 기존 목차 이동·이력 복원 화면을 실제 API 흐름으로 확인하고 README를 현행화했습니다.
  확인 과정에서 동작을 바꿔야 할 결함은 발견하지 못했습니다. 복원이 분류도 되돌리므로
  분류에 미저장 변경이 있을 때도 복원을 막도록 했습니다.
- B1·B2. `/dashboard/categories`와 `/dashboard/books/{bookId}/categories`에서 범위만 다른
  `CategoryManager` 컴포넌트로 계층형 카테고리를 생성·이름 변경·상위 이동·삭제합니다.
  트리 구성과 상위 후보(자기 자신·자손 제외)는 `app/utils/categories.ts` 순수 함수로 분리했고,
  `utils/toc.ts`의 `possibleParents`를 제네릭으로 바꿔 재사용합니다.
- B3. 태그 생성·삭제(중복·사용 중 409 안내)와 내 책 관리의 책별 **분류** 패널을 추가했습니다.
  플랫폼 카테고리 필드는 선택지가 있을 때만 보이고, 숨겨져도 불러온 값을 그대로 다시 보냅니다.
- B4. 페이지 편집 화면에 **분류** 패널을 추가했습니다. 저장 응답의 revision으로 초안 revision을
  갱신하고, 미저장 본문이 있으면 저장을 막으며, 409 충돌 시 선택을 유지한 채 최신 초안을 다시
  불러올 수 있습니다. 복원 후 분류 패널을 다시 불러옵니다. 발행 버튼의 동작은 바꾸지 않았습니다.
- 백엔드 API·DTO는 변경하지 않았습니다.

### 2026-11-18: Claude Code 하네스 구성

- `CLAUDE.md`가 `.github/copilot-instructions.md`를 import하고, `.claude/rules`·`.claude/skills`는
  `.github` 원본의 심볼릭 링크, `.claude/agents`는 Claude 도구 형식의 별도 파일로 구성했습니다.
- 경로별 지침에 Claude용 `paths`를 추가하고, 구현 상태·발행 취소 보류에 맞게 공통 지침과 스킬을 고쳤습니다.
- 세션에서 `CLAUDE.md`와 경로별 지침의 자동 로딩을 확인했습니다. 스킬·에이전트 목록 로딩은
  새 세션에서 확인이 필요합니다.
- Notion 설계안에 구현 현황(§0)과 설계 대비 변경점을 반영했습니다.

### 2026-11-18: 사용자 공간 화면 요구사항 확정

- 요구사항: [docs/checkpoints/user-space-ui.md](docs/checkpoints/user-space-ui.md) (Q1~Q3 추천안 A).
- 공간의 공개 책 목록 API가 없어 `GET /api/v1/spaces/{handle}/books`를 추가합니다(`backend-engineer`).
- `/@{handle}` SSR 공개 공간 화면, 내 책 관리 상단의 **내 공간** 소개 편집 패널,
  홈·검색·독서 화면의 `@handle` 링크를 구현합니다(`frontend-engineer`).
- 구현은 아직 시작하지 않았습니다.

### 2026-11-18: 사용자 공간 화면

- 요구사항: [docs/checkpoints/user-space-ui.md](docs/checkpoints/user-space-ui.md) (Q1~Q3 추천안 A).
- A. `GET /api/v1/spaces/{handle}/books`를 추가했습니다(별도 커밋, 기존 `BookRepository.list()` 재사용).
- B. `/@{handle}`(`pages/@[handle]/index.vue`)이 공간과 공개 책 목록을 SSR로 렌더링합니다.
  소개는 일반 텍스트(`white-space: pre-line`)이며, 없는·비활성 공간은 404, 그 외 오류는 503과 다시 시도입니다.
  대문자·공백이 섞인 handle은 페이지 미들웨어에서 `normalizeHandle` 결과로 301 리다이렉트합니다.
  제목 `@handle — WikiBlog`과 소개 앞 160자(없으면 기본 문구)를 메타 설명으로 씁니다.
  소유자 링크(소개 편집·내 책 관리)는 브라우저에서 세션의 handle과 비교해 표시합니다.
- C. 내 책 관리 상단 **내 공간** 패널에서 소개를 편집합니다. 코드 포인트 기준 500자 카운터와 초과 시 저장 차단,
  CSRF 포함 `PATCH`, 응답으로 갱신, 중복 제출 방지, 실패·401 시 입력 보존과 새 탭 로그인 안내,
  즉시 공개 안내를 제공합니다. 기존 분류 패널과 함께 미저장 변경 이탈 확인(라우트 이동·새로고침)을 합니다.
- D. `utils/paths.ts`에 `spacePath()`를 추가하고 홈 책 카드·검색 결과·책 소개·독서 사이드바·이동 경로의
  `@handle`을 공간 링크로 바꿨습니다. 링크 중첩을 피하려고 책 카드와 검색 결과를 `<a>` 하나로 감싸는 대신
  제목 링크가 `::after`로 카드 전체를 덮고 작성자 링크를 그 위에 따로 두는 구조로 바꿨습니다.
- 책·페이지 URL의 대문자 handle 정규화는 범위 밖으로 남겼습니다(지금처럼 404).
- 웹 화면 외 백엔드 API·DTO는 이 단계(B·C·D)에서 변경하지 않았습니다.

### 2026-11-18: 운영 1 — 프록시 신뢰 경계와 요청 제한 요구사항 확정

- 요구사항: [docs/checkpoints/ops-proxy-rate-limit.md](docs/checkpoints/ops-proxy-rate-limit.md) (Q1~Q4 추천안 A).
- 웹 프록시가 클라이언트의 `X-Forwarded-For`를 그대로 전달하므로, API의 `trust proxy`만 켜면 IP 위조로
  요청 제한을 우회할 수 있음을 확인했습니다. 프록시 헤더 재작성과 `TRUST_PROXY` 신뢰 대역 지정을 함께 진행합니다.
- 개발 서버의 `nitro.devProxy`와 운영 서버 라우트로 프록시 경로가 나뉘어 있을 수 있어 하나로 통일합니다.
- 구현은 아직 시작하지 않았습니다.

### 2026-11-18: 운영 1 — 프록시 신뢰 경계와 요청 제한

- 요구사항: [docs/checkpoints/ops-proxy-rate-limit.md](docs/checkpoints/ops-proxy-rate-limit.md) (Q1~Q4 추천안 A).
- B-1 확인: `nuxt dev`에서 브라우저의 `/api` 요청은 `nitro.devProxy`(httpxy)가 처리했습니다. Nitro 개발 서버가
  `devProxy`를 워커(서버 라우트)보다 먼저 등록하며, 같은 echo 서버로 보낸 요청에 `devProxy`만 붙이는
  `x-forwarded-port`·`x-forwarded-proto`가 있고 클라이언트의 `X-Forwarded-For`가 그대로 전달되었습니다.
  SSR 내부 호출(`useRequestFetch`)만 `server/api/[...path].ts`를 거쳤습니다. 즉 개발과 운영의 프록시 코드가 달랐습니다.
- A. API: `TRUST_PROXY`(IP·CIDR 목록, `loopback`·`linklocal`·`uniquelocal`)를 `config.ts`에서 검증하고
  설정 시에만 Express `trust proxy`에 적용합니다. `true`·숫자·`*`·`/0`·잘못된 형식은 시작 시 오류입니다.
  요청 제한 키는 `request.ip`이며 `::ffff:a.b.c.d`는 IPv4로 정규화합니다. 제한 횟수(15분 20회)는 그대로입니다.
- B. 웹: `nitro.devProxy`를 제거하고 개발·운영 모두 `server/api/[...path].ts`가 `/api`를 전달합니다.
  헤더 처리 순수 함수(`server/utils/apiProxy.ts`)가 클라이언트의 `X-Forwarded-*`·`X-Real-IP`·`Forwarded`를 버리고
  프록시가 본 연결 주소 하나로 `X-Forwarded-For`를 씁니다. 쿠키·CSRF·Origin·Content-Type은 유지합니다.
  `nuxt dev`의 Nitro 워커는 유닉스 소켓 뒤에 있어 소켓 주소가 없으므로, 개발 서버 첫 hop
  (`devServerHandlers`)이 같은 방식으로 헤더를 다시 쓰고 워커는 개발 모드에서만 그 값을 씁니다.
  운영 빌드의 SSR 내부 호출은 연결 주소가 없어 `X-Forwarded-For` 없이 전달됩니다.
  시간 제한은 기본 30초(`NUXT_API_PROXY_TIMEOUT_MS`)이고 넘으면 504 `{"error":"Upstream timeout"}`입니다.
  웹 화면의 `apiErrorStatus`는 504를 일반 오류로 처리하므로 충돌하지 않습니다.
- C. Compose: 웹·API 전용 네트워크 `web-api`(`WEB_API_SUBNET`, 기본 `10.231.0.0/29`)를 만들고 웹에 고정 주소
  `WEB_PROXY_IP`(기본 `10.231.0.6`)를 주어 API `TRUST_PROXY`를 그 주소 하나로 설정했습니다(대역보다 좁음).
  worktree 스택은 `.env`에서 `10.231.0.8/29`·`10.231.0.14`를 씁니다. README "실행"과 `.env.example`을 갱신했습니다.
- 계정(이메일) 기준 로그인 제한은 하지 않았습니다(Q4, 미결 정책으로 유지).

### 2026-11-18: 운영 2 — CI 요구사항 확정과 운영 배포 체크리스트

- 요구사항: [docs/checkpoints/ops-ci.md](docs/checkpoints/ops-ci.md) (Q1~Q4 추천안 A).
  Git 루트가 `wikis/`이므로 워크플로는 루트 `.github/workflows/wikiblog-ci.yml`에 두고 `wikiblog`에서 실행합니다.
- 운영에는 리버스 프록시와 CDN을 두기로 결정해, 클라이언트 IP 신뢰 체인 재설계·CDN 캐시·HTTPS 항목을
  [docs/checkpoints/ops-deploy-checklist.md](docs/checkpoints/ops-deploy-checklist.md)로 정리했습니다.

### 2026-11-18: 운영 2 — CI

- 요구사항: [docs/checkpoints/ops-ci.md](docs/checkpoints/ops-ci.md) (Q1~Q4 추천안 A).
- 저장소 루트에 `.github/workflows/wikiblog-ci.yml`을 추가했습니다. `wikiblog/**`·워크플로 파일을 바꾼 PR과
  `main` push, 수동 실행에서 `wikiblog/`를 작업 디렉터리로 실행합니다. 권한은 `contents: read`, 같은 ref의 이전 실행은
  취소하고 job마다 시간 제한을 둡니다. 외부 액션은 `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`
  (pnpm 버전은 `packageManager`)만 씁니다. Node 24, pnpm 저장소 캐시, `pnpm install --frozen-lockfile`.
- 정적 검사·단위 job: libs 빌드 → API 타입 검사 → 웹 타입 검사 → API 빌드 → API·웹 단위 테스트 → 웹 빌드.
- 통합 job: Redis 7.4는 서비스 컨테이너, MySQL 8.4는 job 안에서 `openssl rand`로 만든 일회용 비밀번호(`::add-mask::`)로
  step에서 띄웁니다(서비스 컨테이너 env는 job 시작 전에 정해지기 때문). 마이그레이션 → API 백그라운드 실행 →
  `/api/health` 최대 60초 대기 → `INTEGRATION_TESTS=1` 테스트. `node --test` 요약의 `skipped`가 0이 아니거나 요약이 없으면 실패합니다.
- `package.json`에 `engines.node: ">=24"`를 추가했습니다(lockfile 변화 없음). 요청 제한을 끄는 설정은 추가하지 않았습니다
  (통합 테스트 한 번에 가입 14회·로그인 2회로 15분 20회 안).
- README에 CI 절, `CLAUDE.md`에 "CI와 같은 검사" 명령을 추가했습니다. 설계안 §12의 워크플로 위치(`wikiblog/.github/workflows/`)는
  실행되지 않는 위치임을 README에 적었습니다.
- GitHub에서의 실제 실행은 아직 하지 않았습니다(push는 사용자 승인 후).

### 2026-11-18: 운영 배포 요구사항 확정

- 요구사항: [docs/checkpoints/ops-deploy.md](docs/checkpoints/ops-deploy.md). Q1 CDN은 보류, Q2~Q7은 추천안 A입니다.
- 운영 빌드의 웹 프록시는 소켓 주소만 쓰므로, 호스트 nginx가 공개 포트로 넘기면 모든 요청이 Docker 게이트웨이 하나로 집계됩니다.
  그래서 웹에 `WEB_TRUST_PROXY`(신뢰 hop의 XFF만 이어받음)를 추가합니다.
- 구현은 아직 시작하지 않았습니다.

### 2026-11-19: Tailwind 도입·로그인 화면·검색 화면 개편·UI 일관성 점검

- 웹에 Tailwind CSS v4(`tailwindcss`·`@tailwindcss/vite` 4.3.5)와 아이콘 `@lucide/vue` 1.75.0을 추가했습니다.
  `lucide-vue-next`는 npm에서 `@lucide/vue`로 이름이 바뀌어 폐기 표시되어 후속 패키지를 썼습니다.
  Tailwind는 preflight 없이 theme·utilities 레이어만 가져오고, 기존 main.css 규칙을 `base`·`components` 레이어로 옮겨
  유틸리티가 덮어쓸 수 있게 했습니다. 색·반경·컨트롤 높이 토큰을 CSS 변수로 정의하고 `@theme inline`으로 연결했습니다.
  기존 `.container`와 같은 이름의 Tailwind 유틸리티는 `@source not inline`으로 만들지 않습니다.
- 헤더: 비로그인 **로그인** 버튼, 로그인 시 계정 메뉴(내 공간·내 책 관리·로그아웃). 세션은 브라우저에서만 조회하는 공용 상태
  (`useCurrentUser`)로 관리하며 공간 화면 소유자 링크와 내 책 관리 화면의 로그인·로그아웃도 이 상태를 갱신합니다.
  헤더 검색 아이콘을 Lucide로 바꾸고 검색 화면에서는 헤더 검색을 숨깁니다.
- 로그인·회원가입: 가운데 카드, 입력 아이콘, 비밀번호 보기/숨기기, 처리 중 스피너, 오류 상자. 기존 검증·오류 문구·중복 제출 방지·입력 보존·이동은 유지했습니다.
- 검색: velog 검색 화면의 구성(상단 큰 입력, 입력 중 자동 검색, 총 결과 수, 작성자 아바타와 요약 목록)을 참고해 WikiBlog 색·간격으로 다시 만들었습니다.
  300ms 디바운스 `router.replace`, Enter 즉시 검색, IME 조합 중 미검색, 지우기 버튼, 이전 결과 유지 로딩, 50개 안내, 유형 배지를 추가했습니다. 검색 API 계약은 그대로입니다.
- 일관성 수정: `.button` 높이 44px·간격 8px·반경·hover를 통일하고 보조·위험 버튼 hover, 관리 폼 입력 높이(44px)를 맞췄습니다.
  홈·공간 책 카드의 글자 아이콘(▤·↗)을 Lucide 아이콘으로, 내 책 관리 동작 행의 링크 색을 동작 버튼과 같게,
  `.page-intro` 글자 크기를 다른 화면 부제와 같게, 좁은 화면에서 제목 옆 버튼이 줄바꿈되지 않게 했습니다.
  남긴 불일치(헤더 폭 1280px과 본문 1120px, 화면별 빈 상태 표현 차이, 관리 화면 아이콘·`→` 글자 화살표 등)는 다음 정리 대상입니다.
  후속 정리(2026-11-19): 내 책 관리의 중복 로그아웃 행(헤더 계정 메뉴와 중복)을 제거했고, 헤더 계정 메뉴의 펼침 아이콘이
  좁은 공간에서 찌그러지지 않도록 크기를 고정(`shrink-0`)했습니다. 웹 타입 검사와 테스트 23개를 다시 통과했고, 이 두 수정은 브라우저로 다시 찍어 보지 않았습니다.

### 2026-11-19: 파비콘·head 메타 주입·CSS/JS 외부화

- 파비콘: 헤더 브랜드 마크(파란 둥근 사각형 `#2663ce` + 흰 W)와 같은 `public/favicon.svg`를 path로 그렸고,
  `favicon.ico`(16·32·48)·`apple-touch-icon.png`(180)·`icon-192/512.png`·`site.webmanifest`를 추가했습니다.
  PNG·ICO는 `apps/web/scripts/generate-icons.mjs`가 공식 Playwright Docker 이미지의 Chromium headless shell로 만듭니다(재생성 방법은 README).
- head: `nuxt.config.ts`의 `app.head`에 `lang="ko"`·charset·viewport·기본 title/description·`theme-color`·아이콘 link를 두고,
  `app.vue`의 함수형 `titleTemplate`으로 `화면 제목 — WikiBlog`(제목 없으면 사이트 기본 제목) 규칙을 한 곳에서 정했습니다.
  모든 페이지의 `useSeoMeta`를 공통 composable `usePageMeta`로 바꾸고 제목의 `— WikiBlog` 중복을 없앴습니다.
  og·twitter 태그를 함께 넣고, 책(소개)·페이지(본문 앞부분 텍스트)·공간(소개)·검색(검색어) description을 데이터로 만듭니다.
  공간에만 있던 오류 상태 `noindex`를 책·페이지에도 적용했습니다. 순수 로직은 `utils/meta.ts`·`markdownPlainText`로 분리해 단위 테스트했습니다.
- 외부화: `features.inlineStyles: false`로 SSR HTML의 인라인 `<style>`을 없애고 외부 `/_nuxt/entry.*.css` link만 남겼으며,
  `experimental.entryImportMap: false`로 인라인 import map을 없앴습니다. 목차·카테고리 깊이의 인라인 `style`을 `.depth-N` 클래스로 바꿨습니다.
  남은 인라인은 Nuxt의 `__NUXT_DATA__`(JSON 데이터)와 `window.__NUXT__.config` 스크립트입니다(끌 설정 없음, README 참고).
- 함께 고친 결함: 운영 빌드(`node .output/server/index.mjs`)에서 `@lucide/vue`가 외부 CJS로 남아 다른 vue 인스턴스를 불러
  아이콘이 있는 모든 화면 SSR이 500이던 문제를 `build.transpile`로 고쳤습니다(개발 서버·Docker 개발 스택은 영향 없음, CI는 빌드만 해 발견되지 않음).
- 남은 일: `og:url`·`og:image`(사이트 절대 주소 설정 필요), CSP 헤더 도입(남은 인라인 스크립트의 해시 또는 nonce 필요).

### 2026-11-19: MVP 콘텐츠 기능 결정과 브랜드 색 통일

- 발행 취소, 이미지 첨부(DB), 플랫폼 카테고리 시드 요구사항을 확정했습니다([요구사항](docs/checkpoints/mvp-content.md)). 구현은 아직 시작하지 않았습니다.
- 강조색 토큰 `--accent`를 헤더 마크·파비콘 색 `#2663ce`로 통일했습니다. hover는 `#1d50a8`이고, 흰 배경 대비는 각각 5.59:1, 7.59:1입니다. 브랜드 마크도 하드코딩 대신 토큰을 씁니다.

### 2026-11-19: MVP 콘텐츠 — 백엔드(발행 취소·이미지·카테고리 시드)

- 발행 취소 `POST /api/v1/pages/{pageId}/unpublish`: 소유자·CSRF, 타 사용자 404, 미발행이면 빈 목록으로 200(멱등).
  요청 페이지와 발행된 모든 자손의 `published_version_id`를 같은 트랜잭션에서 해제하고 `{ id, unpublishedPageIds }`를 반환합니다.
  초안·이력·목차 revision은 바뀌지 않습니다. DTO `UnpublishPageResponse`.
- 이미지: `006_images.sql`(`images`, MEDIUMBLOB, `space_id` 인덱스·FK). 업로드 `POST /api/v1/me/images`는 원본 바이트를 받고
  (이 경로만 JSON 규칙 예외, Origin 유지, 세션·CSRF·선언 형식은 본문을 읽기 전에 확인), 매직 바이트로 PNG·JPEG·WebP·GIF를 판정합니다.
  미허용 선언 415, 시그니처 불일치·빈 본문 400, 2 MiB 초과 413, 공간 총량 50 MiB 초과 409(공간 행 잠금으로 동시 업로드 직렬화), 성공 201
  `{ id, url, contentType, byteSize }`(DTO `ImageUploadResponse`). 조회 `GET /api/v1/images/{id}`는 공개이며 형식 오류·없음·비활성 소유자 404,
  저장 `Content-Type`·`nosniff`·`immutable` 캐시·`inline`·`Content-Length`·`CSP default-src 'none'; sandbox`를 보냅니다.
- 웹 `renderMarkdown`: `img`는 `/api/v1/images/<uuid>`만 남기고 `loading="lazy"`·`decoding="async"`를 붙입니다. 외부·`data:`·프로토콜 상대 이미지는 제거합니다.
- 플랫폼 카테고리: `007_platform_categories.sql`로 최상위 6개를 고정 UUID와 `ON DUPLICATE KEY UPDATE`로 시드했습니다.
- 문서: README(발행 취소·이미지 API·오류 표·시드), 운영 배포 요구사항(nginx 이미지 경로 `client_max_body_size 3m`, 백업·용량 D-5).

### 2026-11-19: MVP 콘텐츠 — 화면(이미지 넣기·발행 취소)

- 이미지 넣기(B-5): `app/utils/imageUpload.ts`(형식 4종·2MB·빈 파일 사전 검사, 파일명→alt 정리, 커서 위치 문단 삽입, 고유 임시 자리
  `![업로드 중: 이름](uploading:<임시 id>)` 생성·교체·제거, 업로드 후 본문 바이트 추정, 상태 코드별 문구), `app/composables/useImageUpload.ts`
  (`$fetch`로 `body: File`, `Content-Type: file.type`, `X-CSRF-Token`; 큐로 한 장씩 순서대로, "이미지 n/m 업로드 중", 응답 URL을
  `isInternalImageUrl`로 확인), `app/components/ImageUploadButton.vue`(`ImagePlus`/스피너, `aria-label`, 숨긴 file input `accept` 4종 `multiple`).
  편집 화면 본문 칸에 붙여넣기(이미지 항목만)·끌어다 놓기(`drop-active` 테두리 강조, 파일을 놓아도 브라우저가 파일을 열지 않게 기본 동작 차단)를 연결했습니다.
  업로드 중에는 저장·발행을 잠그고 화면 이탈을 막으며 본문 입력은 계속 허용합니다. 임시 자리를 지우면 결과를 넣지 않고, 실패하면 임시 자리를 지웁니다.
  업로드 후 본문이 12,000바이트를 넘게 되면 업로드 전에 거부합니다(고아 이미지 방지). 401·403은 입력을 보존하고 "새 탭에서 로그인" 링크를 보여줍니다.
  결과로 바뀐 본문은 기존 dirty·이탈 확인 규칙을 그대로 따릅니다. 이미지는 별도 문단(앞뒤 빈 줄)으로 넣어 글과 같은 줄에 붙지 않게 했습니다.
- 발행 취소(A-4): 페이지 목록(발행된 행)과 편집 화면(발행된 페이지)에 버튼을 두고, 확인 패널에서 관리 목차 `published`로 센 하위 발행 페이지 수를
  안내합니다(`publishedDescendantCount`, `app/utils/toc.ts`). 열면 확인 버튼으로 포커스, 닫으면 원래 버튼으로 돌아갑니다. 성공 시 응답
  `unpublishedPageIds`로 상태를 갱신하고 함께 취소된 하위 수를 알립니다. 요청 중 버튼 잠금으로 중복 요청을 막습니다.
  결정: 발행 취소는 초안을 바꾸지 않으므로 편집 화면에 미저장 변경이 있어도 허용하고, 확인 패널에 "저장하지 않은 본문 변경은 그대로 남습니다"를 덧붙입니다.
- C-2: 책 분류 패널의 플랫폼 카테고리 필드가 시드 6개로 나타남을 브라우저로 확인했습니다(코드 변경 없음).
- 스타일: main.css에 `.editor-toolbar`, `.page-editor textarea.drop-active`, `.image-upload-status`, `.image-upload-error`, `.unpublish-confirm`
  (인라인 스타일 없음). `.markdown-body img { max-width: 100%; height: auto; }`는 기존 규칙을 그대로 씁니다.

### 2026-11-20: 운영 배포 구현

요구사항: [docs/checkpoints/ops-deploy.md](docs/checkpoints/ops-deploy.md) 4절 A~E. 실제 EC2 배포는 사용자가 [런북](deploy/README.md)으로 진행합니다.

- A. 운영 이미지·Compose: `Dockerfile.prod`(빌드 단계 → target `web`은 `.output`만, `api`는 `pnpm deploy --prod`로 모은 `src`·`migrations`·운영 의존성·libs `dist`;
  Node 24 alpine, `node` 사용자, 파일은 root 소유). `compose.prod.yaml`(web만 `127.0.0.1:3000`, api·mysql·redis 비공개, 전 서비스 `restart: unless-stopped`·
  헬스 체크·json-file 로그 순환, web·api 읽기 전용 루트·`cap_drop: ALL`·`no-new-privileges`·`init`, `COOKIE_SECURE=true`·`APP_ORIGIN=https://<APP_DOMAIN>`,
  API 시작 명령에 마이그레이션 없음, MySQL 이름 있는 볼륨, web은 `web-api` 네트워크 하나와 고정 게이트웨이 `WEB_GATEWAY_IP`), `.env.production.example`.
  `.gitignore`에 `.env.production`·`.deploy/`, `.dockerignore`에 `.env.*`·`.claude`(심볼릭 링크) 추가. 개발용 `Dockerfile`·`compose.yaml`은 바꾸지 않았습니다.
- B. 웹 신뢰 체인: `WEB_TRUST_PROXY`(런타임 `NUXT_WEB_TRUST_PROXY`). API `TRUST_PROXY`와 같은 허용 규칙(단위 테스트가 두 파서를 같은 값으로 대조), 문자열이 아닌 값
  (Nuxt가 `true`·숫자로 해석한 값)도 거부, 잘못된 값이면 Nitro 플러그인이 시작 시 실패시킵니다. 소켓 주소가 목록에 있을 때만 `proxy-addr`(Express와 같은 라이브러리, 웹 의존성 추가)로
  XFF 오른쪽부터 신뢰하지 않는 첫 주소를 골라 그 하나로 XFF를 다시 씁니다(IP가 아니면 소켓 주소). 미설정이면 기존 동작 그대로이고, 개발 서버 첫 hop도 같은 값을 따릅니다.
  API `TRUST_PROXY`·요청 제한 로직은 바꾸지 않았습니다.
- C. `deploy/nginx/wikiblog.conf`: 첫 hop으로 `X-Forwarded-For $remote_addr` 덮어쓰기, `X-Real-IP`·`Forwarded`·`X-Forwarded-Host/Port` 제거, 443 TLS 1.2+·HSTS·Let's Encrypt 경로,
  80 리다이렉트와 `/.well-known/acme-challenge/`, 모르는 Host 거부(80은 444, 443은 `ssl_reject_handshake`), 본문 상한 64k·`location = /api/v1/me/images`만 3m,
  시간 제한 60초(웹 30초보다 김), `/_nuxt/`만 `public, max-age=31536000, immutable`(upstream 값은 숨김).
- D. `deploy/deploy.sh <ref>`: 체크아웃(로컬 변경 시 중단) → 커밋 12자리 태그로 빌드 → MySQL·Redis 대기 → 새 이미지 일회성 `migrate`(실패 시 중단) → `up -d --wait` →
  `/api/health`·SSR `/` 확인 → 실패 시 이전 태그 이미지로 롤백(git도 이전 커밋으로). `flock`으로 동시 배포 방지, 본문을 함수로 감싸 체크아웃 중 스크립트 변경에 안전.
  런북 `deploy/README.md`: 권장 구성(t3.medium·Ubuntu 24.04·SSM·deploy key·데이터 EBS 분리·Elastic IP·swap), 보안 그룹·`ss -ltnp` 확인, 인스턴스 준비, 인증서 발급·자동 갱신 hook,
  첫·정기 배포, 롤백·스키마 호환 원칙, 로그, DB 비밀번호 변경(ALTER USER 후 `.env.production`), 사용자 비활성화·이미지 수동 삭제·사용량 SQL, 백업(DLM + `mysqldump --hex-blob` cron, 복구 초안), 디스크 확인.
- E. CI `production-image` job: 일회용 비밀번호 환경 파일 → `deploy.sh`로 운영 이미지 빌드(push 없음)·마이그레이션·기동 → 공개 포트로 SSR 6개 경로·`/api/health`·`/_nuxt` 자산 확인,
  3000 외 포트 공개 시 실패, 스택·볼륨 삭제. 기존 job은 바꾸지 않았습니다.
- 문서: README(실행 절의 운영 배포 개요·`WEB_TRUST_PROXY`, CI job, 디렉토리, 낡은 "운영 방안 미구현"·"리버스 프록시와 CDN을 두므로" 문장 수정), 요구사항 수용 기준 체크.
- 발견한 한계: 웹이 Docker 게이트웨이를 믿으므로 호스트 프로세스뿐 아니라 **같은 호스트의 다른 Docker 네트워크 컨테이너**도 웹 컨테이너 주소로 직접 접속하면
  게이트웨이 주소로 SNAT되어 XFF를 위조할 수 있습니다(로컬 재현에서 확인). 운영 인스턴스에는 이 스택 외의 컨테이너를 두지 않는 것을 런북 전제로 적었습니다.

## 마일스톤

| 단계 | 상태 | 진행 내용과 남은 작업 |
| --- | --- | --- |
| 개발 환경·인증·공간 | 구현 완료 | Docker 개발 환경, 인증·세션 및 사용자 공간 API |
| 책·초안·이력 | 구현 완료 | 책 CRUD, 페이지 초안, revision 충돌, 이력·복원 |
| 목차·발행·공개 읽기 | 구현 완료 | 목차 이동·순서, 발행본 분리와 공개 페이지 API |
| 공개 검색·독서 화면 | 구현 완료 | 공개 검색 API, 책 목록·검색·독서 화면 |
| 공개 분류 | 구현 완료 | 카테고리·태그 API와 공개 필터; 플랫폼 카테고리 6개 시드(2026-11-19), 관리 API 없음 |
| 작성자 화면 | 구현 완료 (브라우저 검증 남음) | 인증·책·페이지 편집·발행, 목차 이동·이력 복원, 분류 관리 UI, 발행 취소·이미지 넣기(2026-11-19, Playwright 검증); 실제 API 흐름·타입 검사·빌드 확인, 실제 브라우저·키보드·모바일 확인 필요 |
| 사용자 공간 화면 | 구현 완료 (브라우저 검증 남음) | 공간 책 목록 API, `/@{handle}` 공개 공간, 내 공간 소개 편집, `@handle` 링크; SSR 응답·실제 API·타입 검사·빌드 확인, 실제 브라우저·키보드·모바일 확인 필요 ([요구사항](docs/checkpoints/user-space-ui.md)) |
| 운영 | 진행 중 (운영 1·2 완료, 운영 배포 구현·로컬 재현 완료) | 운영 1: 프록시 신뢰 경계와 요청 제한 구현·검증 ([요구사항](docs/checkpoints/ops-proxy-rate-limit.md)); 운영 2: CI 워크플로 구현, 로컬 재현과 GitHub Actions 첫 실행(PR) 통과 ([요구사항](docs/checkpoints/ops-ci.md)); 운영 배포: 운영 이미지·Compose, 웹 `WEB_TRUST_PROXY` 신뢰 체인, 호스트 nginx 설정, 배포·롤백 스크립트, 런북, CI 운영 이미지 job 구현과 로컬 재현(2026-11-20, [요구사항](docs/checkpoints/ops-deploy.md), [런북](deploy/README.md)); 남은 작업: 사용자의 실제 EC2 첫 배포와 결과 기록, CI 운영 이미지 job의 GitHub 실행 확인, E2E, 모니터링·정기 복구 연습(운영 4), CDN([체크리스트](docs/checkpoints/ops-deploy-checklist.md)) |

## 다음 구현에 적용할 결정 사항

아래는 합의된 정책입니다. 미구현 기능은 위 마일스톤을 참고합니다.

- 책과 계층형 페이지를 관리합니다. 책은 생성 즉시 공개하고 페이지는 각각 발행해야 공개합니다.
- 페이지 초안과 발행본을 분리하며, 페이지 저장·복원은 revision을 검사해 충돌 시 409를 반환합니다.
- 목차 이동·순서 변경은 즉시 반영하되 공개 목차에는 발행된 페이지만 표시합니다.
- 책이나 부모 페이지를 논리 삭제할 때 하위 항목도 함께 논리 삭제합니다. 복구 API는 보류합니다(발행 취소는 2026-11-19 페이지 단위로 도입).
- 공개 책의 분류·태그 변경은 즉시 반영하고 페이지 분류·태그는 발행 버전에 고정합니다.
- 카테고리 삭제는 하위 분류나 연결 콘텐츠가 있으면 거부합니다. 카테고리 검색은 하위 분류를 포함합니다.
- 태그는 앞뒤 공백과 선행 `#`을 제거하고 영문 대소문자를 무시해 중복을 판단합니다.
- 플랫폼 카테고리는 공개 조회만 제공하고 운영자 인증·관리 API는 보류합니다.
- 작성자 분류 관리는 `/dashboard/categories`와 `/dashboard/books/{bookId}/categories`에서 하며, 태그는 태그 관리에서만 생성합니다.
- 웹 프록시는 클라이언트가 보낸 IP 헤더를 버리고 자신이 본 주소로 `X-Forwarded-For`를 다시 쓰며, API는 `TRUST_PROXY`로 지정한 주소·대역만 신뢰합니다(Compose는 웹 컨테이너 고정 주소 하나). 모든 주소를 믿는 설정은 거부합니다. 프록시 시간 제한은 30초(504)이고 개발·운영 프록시 경로는 서버 라우트 하나로 통일합니다.
- CI는 GitHub Actions 서비스 컨테이너(MySQL 8.4·Redis 7.4)에서 API를 직접 실행해 통합 테스트하고, 건너뛴 테스트가 있으면 실패합니다. PR과 `main` push(`wikiblog/**` 경로)에서 Node 24로 실행하며, 원격 push는 사용자 승인 후 합니다.
- 운영 환경은 AWS EC2 인스턴스 안의 Docker입니다. 웹은 `127.0.0.1:3000`에 공개하고 호스트 nginx(Let's Encrypt)가 첫 hop으로 리버스 프록시합니다. CDN은 나중에 도입합니다. MySQL·Redis는 인스턴스 안 컨테이너(EBS), 마이그레이션은 서비스 교체 전 일회성 컨테이너, 공개 SSR은 캐시하지 않고 `/_nuxt/*`만 캐시, 이미지는 EC2에서 직접 빌드합니다([요구사항](docs/checkpoints/ops-deploy.md)).
- 사용자 공간은 `/@{handle}`에 SSR로 공개하고, 대문자 handle은 소문자 URL로 301 리다이렉트합니다. 공간 소개는 일반 텍스트(최대 500자)이며 내 책 관리 상단에서 편집하고 즉시 공개합니다.

## 검증 기록

- 2026-11-17: `pnpm typecheck`, `pnpm --filter @wikiblog/api build` 통과.
- 2026-11-17: Docker의 실제 MySQL·Redis를 사용한
  `docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test`
  통과: 5개 테스트, 0개 실패. 인증·공간과 책 소유권·삭제 흐름을 포함합니다.
- 통합 테스트 환경 변수 없이 API 테스트를 실행하면 통합 테스트는 건너뛰어집니다.
- 페이지 체크포인트: Docker의 실제 MySQL·Redis 연동 테스트 6개 통과. 초안 생성,
  동시 저장 충돌, 소유권, 이력·복원과 책 삭제를 포함합니다.
- 목차·발행 체크포인트: 타입 검사와 API 빌드, Docker의 실제 MySQL·Redis 테스트
  7개 통과. 발행·공개 범위, 계층·순서, 충돌과 하위 삭제를 포함합니다.
- 공개 검색·독서 체크포인트: API·웹 타입 검사와 빌드, MySQL·Redis API 테스트 8개와
  Markdown 안전성 테스트 1개 통과. 브라우저에서 검색, 목차와 이전·다음 이동을 확인했습니다.
- 분류 체크포인트: API·웹 타입 검사와 빌드 통과, 실제 MySQL과 격리된 Redis를 사용한
  API 테스트 9개 통과(실패·건너뜀 0개), Markdown 테스트 1개 통과.
  브라우저에서 카테고리·태그 필터, 책의 분류 링크 및 모바일 검색 화면을 확인했습니다.
- 작성자 인증·책 관리 체크포인트: 웹 타입 검사·빌드와 Markdown 테스트 1개 통과.
  실제 API를 연결한 브라우저에서 가입·로그인·로그아웃, 책 생성·수정·삭제,
  중복 주소와 인증 만료 시 입력 보존, 모바일 화면을 확인했습니다.
- 페이지 작성·발행 체크포인트: 웹 타입 검사·빌드, 웹 Markdown 테스트 1개와
  실제 MySQL·격리된 Redis를 사용한 페이지·발행 API 테스트 2개 통과.
  브라우저에서 페이지 생성·미리보기·저장·발행·재발행·삭제, 충돌 시 입력 보존,
  공개본 분리와 본문 크기 경계를 확인했습니다.

- 작성자 화면(목차·이력·분류 관리) 체크포인트: 웹 타입 검사·빌드 통과, 웹 단위 테스트 7개 통과
  (카테고리 트리·상위 후보 4개, 목차 2개, Markdown 1개). Docker의 실제 MySQL·Redis를 사용한
  API 테스트 9개 통과(실패·건너뜀 0개, 백엔드 변경 없음). 실제 API에 curl로 카테고리 생성·이름 변경·
  이동·순환 400·사용 중 삭제 409, 다른 책·다른 사용자 범위 404, 태그 `#Tag`/`tag` 중복 409와 사용 중
  삭제 409, 책 분류 저장 후 공개 책 화면(SSR)·`/search?categoryId=…&tag=…` 즉시 반영, 페이지 분류 저장 후
  revision 증가·이력 추가·재발행 전 공개 미반영·재발행 후 반영, 분류 저장 후 본문 저장·발행 성공,
  복원 시 분류 복원과 공개본 유지, 오래된 revision 409, 목차 이동·순환 400·revision 충돌 409·
  미발행 상위 아래 이동 409를 확인했습니다. 새 관리 화면 경로의 SSR 응답(200)도 확인했습니다.
  실행 가능한 브라우저가 없어 실제 브라우저 상호작용, 키보드 조작, 모바일 레이아웃,
  이탈 확인 대화상자는 확인하지 못했습니다.
- 사용자 공간 화면(B·C·D) 체크포인트: 웹 타입 검사·빌드 통과, 웹 단위 테스트 11개 통과
  (공간 경로·글자 수·메타 요약 4개 추가). Docker 개발 스택에 curl로 `/@{handle}` SSR 200(소개·책 카드·제목·
  메타 설명), 책 없는 공간의 빈 상태와 소개 없음 문구, 없는 handle·잘못된 형식 404, `/@UA81102`·`/@%20UA81102`의
  301 `Location: /@ua81102`, SSR HTML에 소유자 링크 미포함을 확인했습니다. 실제 API로 소개에 `<script>`·`<b>`를
  저장하면 본문은 `&lt;script&gt;`로 이스케이프되고, 다른 사용자 handle로 보낸 PATCH는 404, 코드 포인트 500자는 200·
  501자는 400임을 확인한 뒤 소개를 원래 값(빈 문자열)으로 되돌렸습니다. 홈·검색·책 소개·페이지 화면의 SSR HTML에서
  공간 링크와 `<a>` 중첩 0개를 확인했습니다. 503 화면(API 장애), 실제 브라우저의 소개 편집·카운터·이탈 확인,
  소유자 링크 표시, 키보드 조작과 모바일 레이아웃은 실행 가능한 브라우저가 없어 확인하지 못했습니다.
  이 단계에서 API 통합 테스트는 다시 실행하지 않았습니다(백엔드 변경 없음).

- 로그인 기능 재점검 (2026-11-18): 웹 프록시(3000) 경유 실제 요청으로 로그인 200(세션 쿠키
  `HttpOnly; SameSite=Lax`, 7일), 세션 조회, 이메일 대소문자 무시, 틀린 비밀번호·없는 이메일 동일 401,
  Origin 없음 403, 비JSON 415, CSRF 없는 로그아웃 403, 로그아웃 204 후 기존 쿠키 401, 다른 세션 유지,
  로그인 후 고정 경로 이동(외부 리다이렉트 없음)을 확인했습니다.

- 운영 1 프록시 신뢰 경계 체크포인트 (2026-11-18): `pnpm build:libs`, `pnpm typecheck`(API),
  `pnpm --filter @wikiblog/web typecheck`·`build` 통과. API 단위 테스트 13개 통과(새 클라이언트 IP·`TRUST_PROXY`·429 분리 10개,
  통합 7개는 환경 변수 없이 건너뜀), 웹 단위 테스트 18개 통과(새 프록시 헤더·시간 제한 7개).
  `docker compose -p wikiblog-wt up --build -d` 후 Docker의 실제 MySQL·Redis 통합 포함 API 테스트 20개 통과(실패·건너뜀 0개).
  실제 스택에서 웹 프록시 경유 실패 로그인 4회(위조 `X-Forwarded-For`·`X-Real-IP`·`Forwarded` 포함)는 모두
  `auth-rate:login:10.231.0.9`(호스트 → 웹 연결 주소)로, 다른 클라이언트(API 컨테이너 10.231.0.10에서 웹으로)의 요청은
  `auth-rate:login:10.231.0.10`으로 나뉘었고 위조값 키는 생기지 않았습니다. 호스트에서 `127.0.0.1:4000`으로 위조 XFF를 붙여
  직접 보낸 요청은 `auth-rate:login:172.21.0.1`(기본 네트워크 게이트웨이, 신뢰 범위 밖)로 집계되었습니다.
  `TRUST_PROXY=true`·`*`·`2`·`0.0.0.0/0`으로 API를 실행하면 시작 시 오류로 종료됨을 확인했습니다.
  API 컨테이너를 일시 정지한 상태에서 웹 `/api/v1/books`는 30.0초 후 504 `{"error":"Upstream timeout"}`, 재개 후 200이었습니다.
  웹 경유 정상 로그인 1회 200·세션 200·`/@ua81102`·책 소개·`/dashboard/books`·`/search` SSR 200(쿠키 전달 포함),
  CSRF 없는 로그아웃 403, 잘못된 Origin 403, 로그아웃 204 후 세션 401을 확인했습니다.
  호스트에서 `nuxt dev`와 운영 빌드(`.output`)를 echo 서버에 연결해, 두 모드 모두 위조 헤더가 제거되고 실제 연결 주소만
  `X-Forwarded-For`로 전달되며(운영 빌드의 SSR 내부 호출은 XFF 없음) 시간 제한 초과 시 504가 반환됨을 확인했습니다.
  한 클라이언트가 실제로 429를 받은 상태에서 다른 클라이언트가 로그인되는지는 실제 스택에서 재현하지 않았습니다
  (카운터 소모를 피함; 키 분리는 단위 테스트와 위 Redis 키로 확인). 실행 가능한 브라우저가 없어 브라우저 검증은 하지 않았습니다.

- 운영 2 CI GitHub 실행 (2026-11-18): 브랜치 `claude/read-directory-6241e5`를 push하고 PR을 열어 첫 실행에서
  정적 검사·단위 job과 통합 job이 모두 성공했습니다(사용자가 PR Checks 화면에서 확인).
- 운영 2 CI 체크포인트 (2026-11-18, 로컬 재현): `actionlint` 1.7.12(shellcheck 포함) 오류 0개.
  깨끗한 `node:24`(v24.22.3) 컨테이너에 추적 파일만 복사해(호스트 `node_modules` 미사용) 워크플로 step을 YAML에서 읽어 같은 순서로 실행했습니다.
  정적 검사·단위 job 통과: `pnpm install --frozen-lockfile`, libs 빌드, API·웹 타입 검사, API 빌드, API 테스트 20개(통과 13, 건너뜀 7 — 통합),
  웹 테스트 18개 통과, 웹 빌드. 통합 job은 고유 이름의 임시 네트워크·Redis 7.4·MySQL 8.4 컨테이너(호스트 포트 공개 없음)로 재현해
  마이그레이션, API 헬스 대기, `INTEGRATION_TESTS=1` API 테스트 20개 통과(실패 0, 건너뜀 0)였고 일회용 비밀번호 2개는 출력에 나타나지 않았습니다.
  실패 재현: `INTEGRATION_TESTS`를 빼면 건너뜀 7개로 통합 job이 실패했고, 단위 테스트 하나를 일부러 깨면 실패 1개로 job이 실패했습니다
  (둘 다 확인 후 되돌림). 임시 컨테이너·네트워크는 모두 삭제했고 기존 `wikiblog-wt`·`wikiblog` 스택은 건드리지 않았습니다.
  GitHub 러너에서만 확인 가능한 항목(액션 버전·캐시, 서비스 컨테이너 준비, 러너의 IPv6 loopback, 경로 필터)은 push 후 확인합니다.

- Tailwind·로그인·검색 개편 체크포인트 (2026-11-19): `pnpm install --frozen-lockfile`, `pnpm build:libs`,
  웹 타입 검사·빌드 통과, 웹 단위 테스트 23개 통과(검색 쿼리 정규화·아바타 이니셜 5개 추가). 빌드 CSS에서 레이어 순서와
  Tailwind `.container` 미생성을 확인했습니다. worktree 스택(`-p wikiblog-wt`, 웹 3100·API 4100, 별도 이미지 태그)을 `--build`로 띄우고
  **공식 Playwright Docker 이미지(1.65.1, Chromium)로 실제 브라우저 검증**을 했습니다(데스크톱 1280px, 모바일 375px 스크린샷 32장).
  자동 확인 47개 통과: 비로그인 헤더 로그인 버튼(36px)과 SSR HTML에 세션 정보 없음, 키보드 Tab 순서와 포커스 링, 검색 초기 포커스·
  디바운스(입력 직후 URL 불변)·자동 검색 결과·Enter 즉시 검색·빈 결과·IME 조합 중 미검색과 조합 후 검색·지우기·기록 미증가·링크 중첩 0개,
  회원가입 중복 409 안내와 입력 보존, 로그인 실패 401 안내·입력 보존·비밀번호 토글·`aria-describedby`, 로그인 성공 후 `/dashboard/books` 이동과
  헤더 계정 메뉴(Enter 열기, Tab 이동, Esc 닫기와 포커스 복귀), 공간 화면 소유자 링크와 헤더 로그아웃 후 즉시 숨김·로그인 버튼 포커스·세션 401,
  모바일·데스크톱 주요 화면(홈·검색·로그인·회원가입·공간·책·내 책 관리·페이지 목록·편집·분류 관리)의 가로 넘침 없음, 페이지 오류·Vue 경고 없음.
  로그인 3회(실패 1·성공 2), 가입 요청 1회(중복)만 사용했습니다. 관리 화면에서 헤더 로그아웃(홈 이동 후 로그아웃) 경로는 검증 스크립트 선택자 오류로
  브라우저에서 끝까지 확인하지 못했고, 그 세션은 서버에 남아 만료를 기다립니다. 컨테이너에 한글 굵은 글꼴이 없어 스크린샷의 제목 굵기는 실제와 다를 수 있습니다.
  API 통합 테스트는 백엔드 변경이 없어 다시 실행하지 않았습니다.

- 파비콘·head 메타·CSS/JS 외부화 체크포인트 (2026-11-19): `pnpm build:libs`, 웹 타입 검사·빌드 통과, 웹 단위 테스트 27개 통과
  (제목 템플릿·제목 조합·description 정리/자르기/대체값·Markdown 텍스트 추출 4개 추가). 의존성 추가 없음(`pnpm install` 미실행).
  변경 전 운영 빌드를 호스트 3200 포트에서 실행하자 홈 SSR이 500(`useLucideProps` undefined)이었고, 수정 후 200입니다.
  운영 빌드 서버(3200, 메인 스택 API 4000에 GET만)에서 curl로 15개 경로(홈·검색·검색어·로그인·가입·공간·대문자 공간 301·책·페이지·없는 책 404·관리 5개)의
  head를 확인했습니다: 템플릿 적용 제목(중복 없음), description·og·twitter 태그, 관리·인증·오류 화면 `noindex`, 아이콘 link 4개,
  `<link rel="stylesheet" href="/_nuxt/entry.*.css">` 1개, 인라인 `<style>`·`style` 속성 0개, 스크립트는 외부 모듈 1개와 Nuxt 인라인 2개(설정·JSON 데이터).
  검색어에 `</title><script>`를 넣어도 title·description 값은 이스케이프됨을 확인했습니다. 아이콘 6개 파일은 200과 올바른 Content-Type
  (`image/svg+xml`, `image/vnd.microsoft.icon`, `image/png`, `application/manifest+json`)으로 서빙됩니다.
  Playwright Docker 이미지(1.65.1, Chromium)로 운영 빌드 8개 화면을 열어 51개 확인 통과: 외부 CSS만 로드·스타일 적용(브랜드 마크 배경색),
  하이드레이션 후 `style` 속성 0개, JS를 끈 상태에서도 첫 화면 스타일 적용(FOUC 없음), 목차 들여쓰기 클래스 적용, 아이콘 디코드(ICO·SVG·PNG),
  Vue 경고·페이지 오류 없음(콘솔 오류는 비로그인 세션 조회 401과 없는 책 문서 404의 리소스 로그뿐). 로그인 요청은 하지 않았습니다.
  헤드리스 브라우저는 탭을 그리지 않아 실제 탭 아이콘 모습과 iOS 홈 화면 아이콘은 확인하지 못했고, 로그인이 필요한 카테고리 관리의 깊이 들여쓰기와
  깊이 1 이상의 목차는 데이터가 없어 브라우저로 보지 못했습니다. `nuxt dev`(3201)에서 페이지 SSR 200과 새 제목·description을 확인했습니다.

- MVP 콘텐츠 백엔드 체크포인트 (2026-11-19): `pnpm build:libs`, `pnpm typecheck`, 웹 타입 검사, API 빌드, 웹 빌드 통과.
  API 단위 테스트 23개(통과 14, 건너뜀 9 — 통합), 웹 단위 테스트 31개 통과(렌더러: 내부 이미지 유지·lazy/async, 외부·프로토콜 상대·data:·javascript:·
  변형 경로 제거, 외부 링크 유지, plain text 이미지 제외). worktree 스택(`-p wikiblog-wt`, 웹 3100·API 4100, 이미지 `wikiblog-wt-dev:local`)을
  `--build`로 띄워 `006_images.sql`·`007_platform_categories.sql`이 적용되고 `migrate` 재실행 시 체크섬 검증만 하고 변경이 없음을, 시드 SQL을
  다시 실행해도 플랫폼 카테고리가 6개임을 확인했습니다. 컨테이너 안 `INTEGRATION_TESTS=1` API 테스트 **23개 통과(실패 0, 건너뜀 0)**.
  통합 테스트 가입 요청은 실행당 15회(제한 15분 20회)이며, 발행 취소 검증은 기존 발행 테스트 계정을 재사용했습니다. 첫 실행이 테스트 코드 오류로
  실패한 뒤 카운터를 지우지 않고 만료(15분)를 기다려 전체를 다시 실행했습니다. 웹 프록시(3100) 경유로 비로그인 업로드 401, 이미지 조회 헤더 전달
  (단 `Content-Length` 대신 chunked)을 확인했습니다. 화면(발행 취소 버튼, 이미지 넣기)과 브라우저 검증, nginx 실제 설정은 남아 있습니다.

- MVP 콘텐츠 화면 체크포인트 (2026-11-19): `pnpm build:libs`, 웹 타입 검사, 웹 빌드 통과. 웹 단위 테스트 **41개 통과**(새 `imageUpload.test.ts` 10개:
  사전 검사·alt 정리·커서 삽입·임시 자리 교체/삭제 시 미삽입/실패 제거·미리보기에서 임시 자리 비표시·바이트 추정·상태 문구·붙여넣기 항목 추출·하위 발행 수).
  worktree 스택(`-p wikiblog-wt`, 웹 3100·API 4100, `nuxt dev`)에서 Playwright Docker(1.65.1, Chromium)로 **50개 확인 통과**(데스크톱 1280, 모바일 390):
  버튼 업로드 2장(n/m 상태·스피너·저장/발행 잠금·순서대로 교체), 합성 `ClipboardEvent` 이미지 붙여넣기(글자 붙여넣기는 기본 동작 유지),
  합성 `DragEvent` 끌어다 놓기(테두리 강조·WebP 업로드), 업로드 중 임시 자리 삭제 시 결과 미삽입, SVG·2MB 초과 사전 거부(요청 0회),
  위장 파일의 실제 서버 400, 12,000바이트 초과 사전 거부, 미리보기 내부 이미지 4장 `lazy`/`async`·로드·`max-width: 100%`, 외부 이미지 제거·외부 링크 유지,
  저장·재발행 후 공개 페이지(SSR HTML 포함) 이미지 4장 lazy 표시·외부 이미지 제거, 편집 화면 발행 취소(하위 발행 1개 안내·미발행 하위 제외·dirty 안내·
  키보드 Enter·포커스 이동·미저장 입력 유지·상위/하위 공개 404), 재발행, 페이지 목록 발행 취소(발행된 행에만 버튼·하위 1개 안내·더블클릭 시 요청 1회·
  전 페이지 미발행·공개 404), 책 분류 패널 플랫폼 카테고리 6개, 모바일 가로 넘침 없음. 409(용량)와 401은 응답을 가로챈 모의 응답으로 확인했습니다
  (실제 50MB 채우기·세션 만료는 하지 않음). 로그인은 1회(`auth-rate:login` 카운터 1)이고 가입은 하지 않았으며, 두 번째 실행부터는 저장한 세션을 재사용했습니다.
  첫 시도 두 번은 스크립트가 로그인 요청을 보내기 전에 실패해(Vite 의존성 최적화로 인한 다시 로드, 헤더 검색 버튼 선택) 카운트되지 않았습니다.
  콘솔 오류는 예열 단계의 비로그인 401·없는 문서 404와 의도한 오류 응답(400·409·401) 리소스 로그뿐입니다.
  스크린샷은 작업 세션 스크래치패드(`shots-mvp/`)에만 있습니다. 실제 파일 선택 대화상자·OS 클립보드·실제 마우스 끌어다 놓기와 운영 빌드에서의 화면,
  nginx 실제 설정은 확인하지 않았습니다.

- 운영 배포 체크포인트 (2026-11-20): `pnpm install --frozen-lockfile`(웹에 `proxy-addr` 2.0.8·`@types/proxy-addr` 추가, lockfile 갱신), `pnpm build:libs`,
  `pnpm typecheck`, API 빌드, 웹 타입 검사·빌드 통과. API 단위 테스트 23개(통과 14, 건너뜀 9 — 통합, API 코드 변경 없음), 웹 단위 테스트 **47개 통과**
  (신뢰 체인 6개 추가: 미설정 기존 동작, 신뢰 hop XFF 채택·IPv4-mapped, 비신뢰 연결 XFF 무시, 위조 다단 XFF·비IP 값, trust-all·형식 오류 거부와 API 파서 대조, 개발 첫 hop 공존).
  운영 빌드(`.output`)를 호스트에서 echo API에 연결해 `NUXT_WEB_TRUST_PROXY` 미설정·비신뢰 주소면 소켓 주소, 신뢰 주소면 XFF의 클라이언트 주소 하나가 전달되고
  `*`·`true`·`0.0.0.0/0`이면 서버가 시작하지 않음을 확인했습니다. `nuxt dev`도 미설정 127.0.0.1·설정 시 198.51.100.7로 같은 결과였습니다.
  `docker compose -f compose.prod.yaml config` 통과, 운영 이미지 빌드(web 254MB·api 273MB, `node` 사용자, 읽기 전용 루트, api `node_modules`는 express·mysql2·redis·libs만).
  actionlint 1.7.12 오류 0개, shellcheck 0.11.0(`deploy.sh`) 0개, `nginx -t`(nginx 1.28.3 컨테이너·호스트) 통과. 개발 `Dockerfile`은 별도 태그로 빌드만 확인하고 지웠습니다.
  로컬 재현(Docker Desktop 29.9.2, 프로젝트 `wikiblog-prodtest`, 웹 `127.0.0.1:3310`, 대역 `10.231.0.16/29`, 이미지 `wikiblog-prodtest-*`): `deploy.sh`로 빌드·마이그레이션 7개·기동,
  nginx 1.28 컨테이너를 host 네트워크로 띄워 호스트 nginx 역할(실제 `wikiblog.conf`를 포트·도메인만 바꿔 사용, 자체 서명 인증서), 클라이언트 컨테이너 3개(10.231.1.11~13).
  ① 실패 로그인이 `auth-rate:login:10.231.1.11`·`.12`·`.13`으로 나뉨 ② 위조 XFF·`X-Real-IP`·`Forwarded`·게이트웨이 주소를 넣은 XFF로도 키가 바뀌지 않음(위조값 키 없음)
  ③ 외부 역할 컨테이너에서 호스트의 3310·3000·4000·3306·6379 연결 불가, API·MySQL·Redis 컨테이너 주소 직접 연결 불가, `docker ps` 공개 포트는 `127.0.0.1:3310`뿐
  — 단 웹 컨테이너 주소 직접 연결(10.231.0.22:3000)은 열려 있고 게이트웨이로 SNAT되어 위조 XFF가 신뢰됨(`auth-rate:login:5.5.5.5`)을 확인해 런북 전제로 기록
  ④ HTTPS에서 가입 201(`Secure; HttpOnly; SameSite=Lax`), 세션 200, CSRF 없음·잘못된 Origin·http Origin 403, 책 생성 201, 홈·공간·책 SSR 200(새 책 표시), 로그아웃 CSRF 없음 403·정상 204·이후 세션 401
  ⑤ `/_nuxt/*.css`만 `public, max-age=31536000, immutable`(없는 `/_nuxt` 파일 404는 헤더 없음), `/`·`/login`·`/favicon.svg`는 캐시 헤더 없음, `/api/health`는 API의 `no-store`, 모든 응답 HSTS,
  80 → 301 `https://`, acme 경로 응답, 모르는 Host·IP 직접 HTTPS 거부, TLS 1.1 거부·1.2 허용
  ⑥ 이미지 2,097,152바이트 201·조회 200(immutable), 2,097,153바이트 API JSON 413, 3.5MB nginx 413, 다른 경로 100KB nginx 413, 20KB JSON API JSON 413
  ⑦ `deploy.sh`: 체크섬이 바뀐 마이그레이션 이미지는 migrate 실패로 중단(서비스 good1 유지), 시작하자마자 종료하는 웹 이미지는 헬스 실패 → good1로 자동 롤백(종료 코드 1, 헬스 ok).
  Redis `auth-rate:*`는 읽기만 했고(새 Redis), 로그인 실패 7회·가입 1회만 썼습니다. 재현 컨테이너·네트워크·볼륨·이미지는 모두 지웠습니다.
  API 통합 테스트는 API 코드 변경이 없어 다시 실행하지 않았습니다. 실행하지 못한 것: 실제 EC2·보안 그룹·Let's Encrypt 발급/갱신, `deploy.sh`의 git 체크아웃 경로(재현은 `WIKIBLOG_DEPLOY_NO_CHECKOUT=1`),
  CI `production-image` job의 GitHub 실행, 브라우저 검증.

## 남은 결정과 주의 사항

- **2026-11-19 결정(MVP 규모 유지)** — 상세는 [docs/checkpoints/mvp-content.md](docs/checkpoints/mvp-content.md):
  - 발행 취소: 페이지 단위로 도입하고, 하위 발행 페이지도 함께 취소합니다. 책 단위 발행 취소는 없습니다.
  - 삭제 복구: 보류를 유지하고, 필요하면 운영자 수동 절차로 처리합니다.
  - 이미지 첨부: S3 없이 MySQL `images` 테이블에 UUID로 저장합니다. PNG·JPEG·WebP·GIF만 받고, 장당 2MB, 공간당 50MB까지입니다. 외부 이미지 주소는 렌더링하지 않습니다.
  - 플랫폼 카테고리: 관리 기능 없이 마이그레이션 시드 6개로 넣습니다.
  - 신고 기능: 만들지 않고, 운영자가 사용자 비활성화로 대응합니다.
  - 책 개수 제한·계정 기준 로그인 제한: 도입하지 않습니다.
  - 작은 결정:
    - 브랜드 색은 마크 색 `#2663ce`로 통일했습니다(반영 완료).
    - `og:url`은 도메인이 정해진 뒤 추가하고, `og:image`는 `icon-512.png`를 기본으로 씁니다.
    - 헤더 로그인 표시는 지금처럼 페이지를 불러올 때 조회합니다(권한은 서버가 판단).
    - 남은 UI 불일치(헤더·본문 폭, 빈 상태 표현, 관리 화면 아이콘)는 다음 UI 정리 때 다룹니다.
    - CI 운영 빌드 실행 확인은 운영 배포 체크포인트에 포함합니다.
- 설계안은 Notion [WikiDocs형 블로그 플랫폼 설계안](https://app.notion.com/p/WikiDocs-41a2d703a2f881a7985eff5af6845fb1?source=copy_link)이며,
  2026-11-18에 구현 현황과 설계 대비 변경점(카테고리 단일 테이블, 분류 전용 API, URL 등)을 반영했습니다.
- **요청 제한 결함 (수정, 2026-11-18 운영 1):** 웹 프록시가 클라이언트 IP 헤더를 버리고 자신이 본 연결 주소로
  `X-Forwarded-For`를 다시 쓰며, API는 `TRUST_PROXY`(Compose: 웹 컨테이너 고정 주소)만 신뢰해 클라이언트별로 집계합니다.
  웹 프록시 시간 제한(30초, 504)도 추가했습니다. 남은 주의: 로컬 개발에서는 호스트의 모든 요청이 Docker 게이트웨이
  주소 하나로 집계됩니다. **운영 환경은 EC2 안 Docker와 호스트 nginx(첫 hop)이며, CDN은 나중에 도입합니다(2026-11-18 결정).**
  운영에서는 웹이 nginx 뒤에 있으므로 웹 `WEB_TRUST_PROXY`로 신뢰 체인을 구현했습니다(2026-11-20, 로컬 재현으로 클라이언트별 키 분리 확인). 운영 빌드의 SSR 내부 API 호출은 웹 서버 주소로 집계됩니다(요청 제한 대상 아님).
  같은 호스트에서 Compose 프로젝트를 여럿 띄우면 `.env`의 `WEB_API_SUBNET`·`WEB_PROXY_IP`를 서로 다르게 둬야 합니다.
- 개발용은 `compose.yaml`, 운영용은 `compose.prod.yaml`·`Dockerfile.prod`·`deploy/`입니다(2026-11-20). 운영 신뢰 체인은 nginx(XFF 덮어쓰기) → 웹(`NUXT_WEB_TRUST_PROXY` = Docker 게이트웨이) → API(`TRUST_PROXY` = 웹 주소)이며, 게이트웨이를 믿는 전제(호스트 접근 통제, 호스트에 다른 컨테이너 없음)는 [런북](deploy/README.md) 2절에 있습니다. CDN은 도입할 때 [체크리스트](docs/checkpoints/ops-deploy-checklist.md)에서 다룹니다.
