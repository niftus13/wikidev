# 체크포인트 요구사항: 운영 배포 — EC2 · Docker · nginx

- 작성: 2026-11-18
- 마일스톤: `history.md`의 **운영** 중 운영 배포 체크포인트
- 상태: **확정** (2026-11-18). [8절](#8-미결-질문과-추천안) 결정: Q1은 CDN을 나중으로 미룸, Q2~Q7은 추천안 A.
- 구현: 2026-11-20 A~E 구현과 로컬 재현 완료(`Dockerfile.prod`, `compose.prod.yaml`, `.env.production.example`, `deploy/`, 웹 `WEB_TRUST_PROXY`, CI `production-image` job).
  실제 EC2 배포는 사용자가 [런북](../../deploy/README.md)으로 진행한다. 검증 기록은 `history.md`.
  B-3 실측: 호스트에서 공개 포트로 들어온 연결은 `web-api` 네트워크 게이트웨이(재현 대역 `10.231.0.16/29`에서 `10.231.0.17`)로 보인다.
  그래서 Compose가 게이트웨이를 `WEB_GATEWAY_IP`(기본 `10.231.0.1`)로 고정하고 `NUXT_WEB_TRUST_PROXY`를 같은 값으로 둔다.
  추가로 확인한 한계: 같은 호스트의 다른 Docker 네트워크 컨테이너가 웹 컨테이너 주소로 직접 접속해도 게이트웨이로 SNAT되어 신뢰된다(런북 2절 전제).
- 근거: [운영 배포 체크리스트](ops-deploy-checklist.md)(1~6절). 이 문서는 그 체크리스트를 확정된 구성으로 좁힌 실행 요구사항이다.
- 사용자 결정 (2026-11-18)
  - AWS EC2 인스턴스 안에서 Docker로 실행한다.
  - 웹(Nuxt)은 포트를 공개하고, **nginx가 리버스 프록시**로 웹 포트에 요청을 넘긴다.
  - CDN은 **나중으로 미룬다**(2026-11-18 Q1). 첫 배포에서는 nginx가 첫 hop이다. CDN을 도입할 때의 항목은 [체크리스트](ops-deploy-checklist.md) 2·3절에 남아 있다.

## 1. 목표 구성

```text
클라이언트
  → EC2 보안 그룹 (80·443만 공개)
  → nginx (호스트)                  TLS(Let's Encrypt), 클라이언트 IP = $remote_addr로 확정 → X-Forwarded-For 재작성
  → 127.0.0.1:3000 (웹 컨테이너 공개 포트, loopback 전용)
  → web (nuxt build 결과)           신뢰 hop(Docker 게이트웨이)에서 온 XFF만 이어받아 API로 전달
  → api (web-api 전용 네트워크)      TRUST_PROXY = 웹 컨테이너 주소
  → mysql · redis (컨테이너, EBS 볼륨, 외부 미공개)
```

## 2. 현재 상태와 바꿔야 하는 것

| 항목 | 현재 | 운영 배포에서의 문제 |
| --- | --- | --- |
| 이미지 | `Dockerfile`은 의존성 설치와 `build:libs`만 한다. 실행 명령은 Compose의 `nuxt dev`·`api dev`이다. | 운영 실행 경로(`nuxt build` → `.output/server/index.mjs`)용 이미지가 없다. 소스를 마운트하고 개발 서버로 실행한다. |
| Compose | `compose.yaml`은 개발용이다(소스 마운트, `COOKIE_SECURE=false`, `APP_ORIGIN=http://localhost:3000`). | 운영용 구성 파일이 필요하다. |
| 웹 프록시 클라이언트 주소 | 운영 빌드에서는 **소켓 주소만** 쓴다(`proxyClientAddress`, `server/api/[...path].ts`). | 호스트 nginx가 공개 포트로 넘기면 소켓 주소가 **Docker 게이트웨이 하나**가 된다. 그래서 모든 사용자가 다시 하나의 요청 제한 키로 묶인다(운영 1 이전 결함 재발). |
| 웹 프록시 전달 헤더 | 클라이언트의 `X-Forwarded-*`를 **모두 버린다**. | nginx가 확정한 클라이언트 주소도 버려진다. |
| API `TRUST_PROXY` | 웹 컨테이너 주소 하나 | 그대로 유지할 수 있다. 웹이 올바른 XFF를 넘기면 된다. |
| 마이그레이션 | API 시작 명령에서 `migrate && dev`로 실행 | 배포 단계에서 실행 시점과 실패 시 처리가 필요하다(8절 Q5). |
| CI | 정적·단위·통합 테스트 | 운영 이미지 빌드 검증이 없다. |

## 3. 하네스 적용

| 작업 | 에이전트 | 스킬 | 자동 적용 지침 |
| --- | --- | --- | --- |
| A. 운영 이미지·Compose | `backend-engineer` | `backend-feature`, `cache-and-db`(MySQL·Redis 볼륨·연결) | `rules/backend.md` |
| B. 클라이언트 IP 신뢰 체인 (웹 코드) | `backend-engineer` | `backend-feature` | `rules/frontend.md`(`apps/web/**`), `rules/testing.md` |
| C. nginx 설정·보안 그룹 문서화 | `backend-engineer` | — | — |
| D. 배포·롤백 스크립트와 런북 | `backend-engineer` | `cache-and-db`(마이그레이션) | — |
| E. CI 운영 이미지 빌드 검증 | `backend-engineer` | — | `rules/testing.md` |
| 완료 전 리뷰 | `quality-reviewer` | — | 신뢰 체인·노출 포트·시크릿 위주 |

**AWS 작업은 사용자가 런북을 따라 직접 한다.** 대상은 EC2, 보안 그룹, DNS, 인증서 발급이다. 이 작업 환경에는 AWS 자격 증명이 없고, 공개 인프라 변경은 외부에 영향을 주는 작업이다. 에이전트는 설정 파일, 스크립트, 런북, 로컬 재현까지만 맡는다.

## 4. 범위

### A. 운영 이미지와 Compose

| ID | 요구사항 |
| --- | --- |
| A-1 | 운영용 멀티 스테이지 Dockerfile을 만든다(`Dockerfile.prod` 또는 같은 파일의 target). |
| | 빌드 단계는 `pnpm install --frozen-lockfile` → `build:libs` → `web build`이다. 실행 이미지에는 필요한 산출물과 운영 의존성만 넣는다. 웹은 `.output`, API는 `src`·`migrations`·libs `dist`를 넣는다. |
| | Node 24이고 non-root 사용자로 실행한다. 개발 의존성과 소스 마운트는 없다. |
| A-2 | `compose.prod.yaml`을 만든다. 서비스는 다음과 같다. |
| | `web`: `node .output/server/index.mjs`, 포트는 **`127.0.0.1:3000:3000`만** 공개한다. `NUXT_API_PROXY_TARGET=http://api:4000`, 시간 제한 30초를 준다. |
| | `api`: 포트를 공개하지 않는다. `APP_ORIGIN=https://<도메인>`, `COOKIE_SECURE=true`, `TRUST_PROXY=<웹 주소>`를 준다. |
| | `mysql`·`redis`: 포트를 공개하지 않는다. MySQL 데이터는 이름 있는 볼륨에 둔다(EBS). |
| A-3 | 모든 서비스에 `restart: unless-stopped`, 헬스 체크, 로그 순환(`json-file`, `max-size`·`max-file`)을 둔다. 웹은 API가 healthy가 된 뒤 시작한다. |
| A-4 | 운영 환경 변수 예시 `.env.production.example`을 만든다. 내용은 도메인, 비밀번호, 네트워크 대역, 신뢰 주소이다. 실제 비밀값은 저장소에 두지 않는다(8절 Q4). |
| A-5 | 개발용 `compose.yaml`과 `Dockerfile`의 동작은 바꾸지 않는다. 개발 흐름에 회귀가 없어야 한다. |

### B. 클라이언트 IP 신뢰 체인 (웹 코드 변경)

| ID | 요구사항 |
| --- | --- |
| B-1 | 웹에 `WEB_TRUST_PROXY` 설정을 추가한다(런타임 설정 `NUXT_WEB_TRUST_PROXY`). 허용 값과 trust-all 거부 규칙은 API의 `TRUST_PROXY`와 같다. **값이 없으면 지금 동작(XFF 모두 버림, 소켓 주소 사용)을 유지한다.** |
| B-2 | 소켓 주소가 신뢰 목록에 있을 때만 XFF를 따른다. 오른쪽부터 신뢰하지 않는 첫 주소를 클라이언트 주소로 정하고, 그 주소 하나로 XFF를 다시 쓴다. 신뢰 목록에 없는 연결이 보낸 XFF는 지금처럼 버린다. |
| | 구현은 Express가 쓰는 `proxy-addr` 라이브러리를 재사용하는 것을 우선 검토한다. |
| B-3 | 운영 Compose에서 `NUXT_WEB_TRUST_PROXY`는 호스트 nginx가 웹 공개 포트로 접속할 때 보이는 **Docker 게이트웨이 주소 하나**로 둔다. 이 주소는 로컬 재현에서 실측해 문서에 적는다. |
| | 한계도 문서에 적는다: 이 주소를 신뢰하면 호스트에서 3000 포트로 오는 모든 연결을 신뢰하게 된다. 그래서 호스트 접근 통제(보안 그룹과 SSH)가 이 신뢰의 전제가 된다. |
| B-4 | 단위 테스트를 추가한다. 다룰 경우는 다음과 같다. |
| | 미설정이면 기존 동작, 신뢰 hop에서 온 XFF 채택, 신뢰하지 않는 연결의 XFF 무시, 위조 다단 XFF, trust-all 값 거부, 개발 모드 첫 hop 처리와의 공존. |
| B-5 | API `TRUST_PROXY`(웹 주소)와 요청 제한 로직은 바꾸지 않는다. |

### C. nginx (첫 hop)와 보안 그룹

| ID | 요구사항 |
| --- | --- |
| C-1 | `deploy/nginx/wikiblog.conf`(호스트 nginx용)를 작성한다. |
| | 443(TLS, Let's Encrypt)과 80(HTTPS 리다이렉트, 인증서 갱신용 `/.well-known/acme-challenge/` 경로)을 둔다. |
| | `proxy_pass http://127.0.0.1:3000`, 요청 본문 상한(서버 기본 `client_max_body_size 64k` — API JSON 16KB보다 여유. 이미지 업로드는 `location = /api/v1/me/images`에서만 `client_max_body_size 3m`: API 상한 2 MiB(2,097,152바이트)보다 커야 상한 초과가 API의 JSON 413으로 일관되게 응답된다 — [mvp-content.md](mvp-content.md) B-8, 2026-11-19 확정), 시간 제한(웹 30초 < nginx)을 설정한다. |
| C-2 | **클라이언트 IP 확정**: nginx가 첫 hop이므로 `$remote_addr`가 곧 클라이언트 주소이다. upstream에는 `proxy_set_header X-Forwarded-For $remote_addr;`로 **덮어쓴다**(`$proxy_add_x_forwarded_for` 금지). 클라이언트가 보낸 `X-Real-IP`, `Forwarded`는 지운다. |
| C-3 | `Host`, `X-Forwarded-Proto https`, `Origin`, 쿠키를 그대로 전달한다. API의 Origin 검사가 `APP_ORIGIN`(https)과 맞는지 확인한다. |
| C-4 | 캐시(8절 Q6): `/_nuxt/*`(해시 파일명)에만 긴 `Cache-Control`(`public, max-age=31536000, immutable`)을 붙인다. 그 밖의 경로는 nginx가 캐시하지 않고 캐시 헤더도 추가하지 않는다. API는 이미 `no-store`를 보낸다. |
| C-5 | HSTS와 TLS 설정(TLS 1.2 이상)을 넣는다. 인증서 자동 갱신(certbot 타이머)과 갱신 후 nginx 재적재를 런북에 적는다. |
| C-6 | 보안 그룹 정책을 문서화한다. 80·443은 전체 공개한다. SSH는 관리자 IP나 SSM Session Manager로 제한한다. 3000·4000·3306·6379는 외부에 열지 않는다. |
| | 호스트 방화벽 없이도 웹 3000이 loopback에만 공개되는지 확인하는 방법(`ss -ltnp`)을 런북에 넣는다. |

### D. 배포·롤백

| ID | 요구사항 |
| --- | --- |
| D-1 | `deploy/deploy.sh`를 만든다. 순서는 다음과 같다. |
| | 지정한 git 태그나 커밋을 체크아웃한다(8절 Q7) → 이미지를 커밋 태그로 빌드한다 → 마이그레이션을 일회성으로 실행한다(8절 Q5) → `up -d` → `/api/health`와 웹 SSR 헬스 체크 → 실패하면 이전 태그로 되돌린다. |
| D-2 | 마이그레이션은 앞으로만 진행하고 체크섬으로 검증한다. 그래서 롤백은 **애플리케이션 이미지만** 되돌린다. 스키마를 되돌려야 하는 변경은 배포 전에 별도로 검토하고, 이 내용을 런북에 적는다. |
| D-3 | 런북 `deploy/README.md`를 작성한다. 다룰 내용은 다음과 같다. |
| | 인스턴스 준비(Docker, Compose 플러그인, nginx, swap), 도메인·인증서(Let's Encrypt), 보안 그룹, 첫 배포, 정기 배포, 롤백, 로그 확인, 백업. |
| D-4 | 최소 백업을 둔다. EBS 스냅샷 정책(DLM)이나 `mysqldump` 정기 실행 중 하나와, 복구 절차 초안을 쓴다. 정기 복구 연습과 모니터링은 운영 4에서 다룬다. |
| D-5 | 이미지 운영 영향(2026-11-19 확정, [mvp-content.md](mvp-content.md) B-8)을 런북에 적는다. |
| | 이미지는 MySQL `images` 테이블(MEDIUMBLOB)에 있으므로 `mysqldump`와 EBS 스냅샷에 그대로 포함된다. `mysqldump`는 `--single-transaction --hex-blob`으로 받고, 덤프 크기가 이미지만큼(hex 기준 약 2배) 커진다. |
| | 용량 계획: 이미지 1장 최대 2 MiB, 공간당 최대 50 MiB. 디스크(EBS)는 `활성 공간 수 × 50 MiB`를 상한으로 보고 MySQL 데이터·binlog·덤프 보관분을 함께 잡는다. 실제 사용량은 `SELECT COUNT(*), SUM(byte_size) FROM images`로 확인한다. |
| | 고아 이미지는 MVP에서 지우지 않으므로 사용량은 줄지 않는다. 정리 작업은 후속이다. |
| | 운영자가 사용자를 비활성화(`users.status = 'disabled'`)하면 그 공간의 이미지 조회도 404가 된다. 이미지 응답은 `Cache-Control: public, max-age=31536000, immutable`이므로 브라우저 캐시에 남은 사본은 만료까지 보일 수 있다(CDN은 보류 상태라 공유 캐시는 없다). |
| | nginx는 `/api/v1/me/images`만 `client_max_body_size 3m`로 두고 나머지는 기본 상한을 쓴다(C-1). |

### E. CI와 로컬 재현

| ID | 요구사항 |
| --- | --- |
| E-1 | CI에 운영 이미지 빌드 job을 추가한다(빌드만, 레지스트리 push 없음). 기존 job은 바꾸지 않는다. |
| E-2 | 로컬 재현: `compose.prod.yaml`과 nginx 컨테이너(호스트 nginx 역할), 서로 다른 주소를 가진 클라이언트 컨테이너 여러 개로 아래를 확인한다. |
| | ① 서로 다른 클라이언트 주소가 서로 다른 요청 제한 키로 집계된다. ② 위조 XFF·`X-Real-IP`·`Forwarded`를 붙여도 키를 바꿀 수 없다. ③ 웹 3000·API 4000·MySQL·Redis는 호스트 외부에서 접근할 수 없다. ④ 로그인, 세션, CSRF, Origin 검사, 공개 SSR이 HTTPS에서 정상이다. ⑤ `/_nuxt/*`에만 긴 캐시 헤더가 붙는다. |
| | 로컬에서는 HTTPS 쿠키를 위해 자체 서명 인증서를 쓴다. 개발 스택과 메인 체크아웃 스택은 건드리지 않는다. |

## 5. 범위 밖

- **CDN 도입**(8절 Q1에서 보류): CDN을 도입할 때 오리진 인증, `real_ip`, CDN IP 대역, 보안 그룹 prefix list, CDN 캐시 정책을 체크리스트 2·3절 기준으로 다시 설계한다.
- AWS 리소스를 실제로 만들고 바꾸는 일(사용자가 런북으로 진행). IaC(Terraform 등)
- RDS·ElastiCache 전환(8절 Q4와 함께 후속 검토), 다중 인스턴스, 오토스케일링
- 이미지 레지스트리(ECR)와 CI 자동 배포(8절 Q7의 후속)
- CloudWatch 등 모니터링·알림, 정기 복구 연습(운영 4)
- 계정 기준 로그인 제한, nginx·WAF 추가 요청 제한(미결 정책)

## 6. 수용 기준

- [x] 운영 이미지로 띄운 스택이 `nuxt build` 결과로 동작한다. 개발 의존성과 소스 마운트가 없고, 웹 3000만 loopback에 공개된다.
- [x] nginx → 웹 → API 체인에서 **클라이언트 IP별로** 요청 제한 키가 나뉜다. 위조 헤더로는 키를 바꿀 수 없다. (로컬 재현. 전제: 호스트 프로세스·호스트의 다른 컨테이너는 신뢰 범위 안 — 런북 2절)
- [x] 웹 3000·API 4000·MySQL·Redis가 외부에 공개되지 않는다. 보안 그룹·포트 정책과 인증서 갱신 절차가 런북에 명시되어 있다. (로컬 재현과 런북. 실제 보안 그룹은 EC2에서 확인)
- [x] `COOKIE_SECURE=true`, HTTPS `APP_ORIGIN`으로 로그인·세션·CSRF·Origin 검사가 동작한다(로컬 재현).
- [x] `WEB_TRUST_PROXY`가 없으면 웹 프록시가 지금과 같이 동작한다. 개발 스택과 기존 CI에 회귀가 없다. (단위 테스트, `nuxt dev`·운영 빌드 echo 확인, 개발 이미지 빌드. 기존 CI job은 변경 없음, GitHub 실행은 push 후)
- [x] 배포 스크립트가 헬스 체크 실패 시 이전 이미지로 되돌리는 것을 로컬에서 확인했다.
- [ ] 런북만 보고 EC2 첫 배포를 진행할 수 있다. 사용자가 실제 배포를 마치면 history에 결과를 기록한다.

## 7. 검증

- 단위: `pnpm --filter @wikiblog/web test`(신뢰 체인 테스트 포함), `pnpm --filter @wikiblog/api test`, 타입 검사
- 운영 이미지: `docker build`(운영 target), `docker compose -f compose.prod.yaml config`
- 로컬 재현: 4절 E-2의 ①~⑤. 이때 Redis `auth-rate:*` 키는 읽기만 한다. 카운터를 지우거나 제한을 끄지 않는다.
- nginx 설정: `nginx -t`(컨테이너)
- CI: 운영 이미지 빌드 job이 통과한다. push는 사용자 승인 후 한다.

## 8. 미결 질문과 추천안

### Q1. CDN

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | **CloudFront**. 뷰어 인증서는 ACM(us-east-1)에서 받는다. 오리진은 EC2 도메인(HTTPS)이고, 오리진 인증은 사용자 지정 헤더로 한다. 보안 그룹은 관리형 prefix list `com.amazonaws.global.cloudfront.origin-facing`으로 연다. |
| | 클라이언트 IP는 CloudFront가 XFF 오른쪽 끝에 붙이는 뷰어 주소를 쓴다. nginx는 `real_ip_header X-Forwarded-For`, `real_ip_recursive on`, CloudFront 대역 `set_real_ip_from`으로 설정한다. |
| B | Cloudflare(프록시 모드, `CF-Connecting-IP`) |

- **추천 이유**
  - EC2와 같은 AWS 안에서 인증서, 보안 그룹 prefix list, 비용 청구를 함께 관리할 수 있다.
  - 오리진 대역을 관리형 prefix list로 제한할 수 있어서, CDN을 우회하는 직접 접속을 보안 그룹 수준에서 막는다.
- **영향**: nginx의 `set_real_ip_from`에 쓸 CloudFront 대역 목록을 갱신하는 절차(AWS `ip-ranges.json` 기반 스크립트)가 런북에 들어간다.
- 결정: **보류 — CDN은 나중에 도입한다** (2026-11-18). 첫 배포는 CDN 없이 nginx가 첫 hop이다. CloudFront 안(A)은 도입할 때 다시 검토한다.

### Q2. nginx 위치

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | **EC2 호스트에 설치**(패키지와 systemd). 웹 컨테이너의 `127.0.0.1:3000`으로 프록시한다. |
| B | nginx도 컨테이너로 Compose에 넣는다. 웹 포트는 공개하지 않고 Docker 네트워크로 연결한다. |

- **추천 이유**
  - "웹은 포트를 공개하고 nginx로 프록시한다"는 결정과 그대로 맞는다.
  - certbot 인증서 갱신과 nginx 재시작을 OS 표준 방식으로 관리할 수 있다.
  - 애플리케이션을 재배포해도 nginx와 TLS는 영향을 받지 않는다.
- **영향**: 웹이 보는 연결 주소가 Docker 게이트웨이이므로 B-3의 신뢰 설정이 필요하다. B를 고르면 nginx 컨테이너의 고정 주소 하나만 신뢰하면 되어 범위가 더 좁아진다.
- 결정: **A** (2026-11-18 승인)

### Q3. 오리진(nginx) TLS

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 오리진 도메인(예: `origin.<도메인>`)에 Let's Encrypt 인증서(certbot)를 받는다. CDN에서 오리진까지 HTTPS로 연결한다. |
| B | CDN에서 오리진까지 HTTP로 연결한다. 보안 그룹과 오리진 인증 헤더로만 보호한다. |

- **추천 이유**: 오리진 인증 헤더와 세션 쿠키가 인터넷 구간을 평문으로 지나가지 않는다. `COOKIE_SECURE=true`와 HTTPS `APP_ORIGIN`의 전제와도 맞는다.
- **영향**: 80 포트로 인증서 갱신(HTTP-01)을 하려면, CDN 경유 경로나 갱신용 경로 예외를 런북에 정해야 한다. 대안은 DNS-01 방식이다.
- 결정: **A** (2026-11-18 승인). CDN이 없으므로 **서비스 도메인 자체**에 Let's Encrypt 인증서를 받고, 80 포트로 HTTP-01 방식으로 발급·갱신한다.

### Q4. 데이터 저장소와 시크릿

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | MySQL·Redis를 **인스턴스 안 컨테이너**로 둔다. MySQL 데이터는 암호화된 EBS 볼륨에 두고, 백업은 EBS 스냅샷(DLM)과 매일 `mysqldump`를 함께 쓴다. |
| | 시크릿은 인스턴스의 `.env.production` 파일(권한 600, 배포 사용자 소유)에 둔다. |
| B | RDS(MySQL 8.4)와 ElastiCache를 쓴다. 시크릿은 SSM Parameter Store나 Secrets Manager에 둔다. |

- **추천 이유**
  - 사용자가 정한 "인스턴스 안 Docker" 구성 그대로 첫 배포를 가장 빨리, 가장 적은 비용으로 할 수 있다.
  - 지금 코드는 MySQL·Redis 연결 정보를 환경 변수로만 받으므로, 나중에 B로 옮겨도 코드는 바뀌지 않는다.
- **영향**
  - 인스턴스 장애가 곧 데이터 장애이다. 그래서 백업과 복구 절차가 필수이다.
  - 시크릿 파일은 저장소와 이미지에 넣지 않는다.
- 결정: **A** (2026-11-18 승인)

### Q5. 마이그레이션 실행 시점

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 배포 스크립트가 새 이미지로 **일회성 `migrate` 컨테이너**를 먼저 실행한다. 성공한 뒤에만 서비스를 교체하고, 실패하면 배포를 중단한다. |
| B | 지금처럼 API 시작 명령에서 `migrate && start`를 실행한다. |

- **추천 이유**: 마이그레이션 실패가 API 재시작 반복으로 번지지 않는다. 배포를 서비스 교체 전에 멈출 수 있고, 실행 기록이 배포 로그 한 곳에 남는다.
- **영향**: 운영 Compose의 API 명령은 `start`만 실행한다. 마이그레이션은 서비스 교체 전에 끝나므로, 새 스키마는 이전 버전 API와도 호환되어야 한다. 이 원칙을 런북에 적는다.
- 결정: **A** (2026-11-18 승인)

### Q6. 공개 SSR 캐시

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 공개 SSR은 CDN에서 **캐시하지 않는다**(CachingDisabled). `/_nuxt/*` 정적 자산만 캐시한다. |
| B | 짧은 TTL(예: 60초)로 캐시하고, 발행 지연을 허용한다. |
| C | 길게 캐시하고, 발행·수정 시 무효화 API를 호출한다. |

- **추천 이유**: 지금 정책은 "책 생성, 책 분류, 공간 소개, 발행이 즉시 공개"이다. 발행 취소 정책도 미결이다. 캐시를 두면 이 계약과 어긋나거나 무효화 구현이 필요하다.
- **영향**: 공개 페이지 트래픽이 모두 오리진에 도달한다. 트래픽이 늘면 B나 C를 후속으로 검토한다.
- 결정: **A** (2026-11-18 승인). CDN이 없으므로 nginx가 `/_nuxt/*`에만 긴 캐시 헤더를 붙인다(C-4). CDN을 도입하면 같은 정책을 CDN 동작으로 옮긴다.

### Q7. 이미지 빌드와 배포 방식

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | EC2에서 저장소를 체크아웃해 **인스턴스에서 직접 빌드**하고 배포한다(`deploy.sh <태그>`). CI는 운영 이미지 빌드만 검증한다. |
| B | CI에서 빌드한 이미지를 ECR에 올리고(OIDC 자격 증명), EC2는 이미지를 받아서 실행만 한다. |

- **추천 이유**
  - 레지스트리, CI의 AWS 자격 증명, 권한 설정 없이 첫 배포를 할 수 있다.
  - 인스턴스 아키텍처(x86_64나 arm64)에 맞는 이미지가 자연스럽게 만들어진다.
- **영향**
  - 인스턴스에 빌드 도구와 충분한 메모리가 필요하다. `nuxt build` 때문에 2GB 이상을 권장하고, 부족하면 swap을 둔다.
  - 빌드 중 CPU 부하가 서비스와 겹친다. 배포 빈도가 늘면 B로 옮긴다.
- 결정: **A** (2026-11-18 승인)

## 9. 사용자가 준비해야 하는 것 (결정이 아닌 전제)

- 서비스 도메인과 DNS 관리 위치(Route 53 등). 도메인 A 레코드를 EC2의 Elastic IP로 연결한다. Let's Encrypt HTTP-01 발급의 전제이다.
- EC2 인스턴스 유형·아키텍처와 OS(Amazon Linux 2023 또는 Ubuntu 24.04). EBS 암호화 여부도 정한다.
- 배포용 OS 사용자와 저장소 접근 방법(배포 키 등). 인스턴스에 개인 자격 증명을 두지 않는다.
- VPC CIDR. Compose 전용 대역 `WEB_API_SUBNET`(기본 `10.231.0.0/29`)과 겹치지 않는지 확인한다.
