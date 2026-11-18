# 체크포인트 요구사항: 운영 2 — CI

- 작성: 2026-11-18
- 마일스톤: `history.md`의 **운영** 중 두 번째 체크포인트
- 상태: **확정** (2026-11-18, [7절](#7-미결-질문과-추천안) 추천안 A 승인)
- 선행: 운영 1 완료 (`docs/checkpoints/ops-proxy-rate-limit.md`)

## 1. 배경과 현재 상태

지금 검증은 모두 개발자가 수동으로 실행한다. 통합 테스트는 `INTEGRATION_TESTS=1`이 없으면 **조용히 건너뛴다**. 그래서 변경을 병합할 때 회귀를 자동으로 막을 장치가 없다.

| 항목 | 현재 | 근거 |
| --- | --- | --- |
| 저장소 구조 | Git 루트는 `wikis/`이고, 프로젝트는 하위 폴더 `wikiblog/`에 있다 | `git ls-files` |
| 워크플로 위치 | GitHub은 **루트의 `.github/workflows/`만** 읽는다. `wikiblog/.github/`에는 Copilot 지침만 있다. | 설계안 §12는 `wikiblog/.github/workflows/`로 적었지만, 그 위치에서는 실행되지 않는다 |
| Node | Docker 이미지는 `node:24-alpine`, 개발 호스트는 Node 26 | `Dockerfile` |
| pnpm | `packageManager: pnpm@10.30.0`, `pnpm-lock.yaml` | `package.json` |
| 단위 테스트 | API(`client-ip` 등)와 웹(18개)은 DB 없이 실행된다 | `node --test` |
| 통합 테스트 | `127.0.0.1:4000`에서 **API가 실행 중**이어야 한다. 테스트 프로세스도 `databaseOptions()`로 MySQL에 직접 접속한다(사용자 비활성화 등). `APP_ORIGIN`도 필요하다. | `apps/api/test/*.test.ts` |
| 마이그레이션 | `pnpm --filter @wikiblog/api migrate` (체크섬 검증) | README |
| 린트 | 설정 없음 | — |
| 원격 | GitHub `niftus13/wikidev`. 이 작업 환경에는 `gh` CLI가 없다. | `git remote -v` |

## 2. 하네스 적용

| 작업 | 에이전트 | 스킬 | 자동 적용 지침 |
| --- | --- | --- | --- |
| A. 워크플로 작성 | `backend-engineer` | `backend-feature`, `cache-and-db`(MySQL·Redis 서비스 구성) | `rules/testing.md` |
| B. 로컬 재현 검증 | `backend-engineer` | — | `rules/testing.md` |
| C. 문서 | `backend-engineer` | — | — |
| 완료 전 리뷰 | `quality-reviewer` | — | 읽기 전용. 시크릿·권한·건너뛰는 테스트 위주로 본다 |

- 워크플로 파일은 프로젝트 폴더 밖(저장소 루트)에 생긴다. 다른 변경은 `wikiblog/` 안에만 둔다.
- **원격 push와 PR 생성은 외부에 공개되는 작업이다. 사용자 승인 없이 하지 않는다**(7절 Q4).

## 3. 범위

### A. 워크플로 `.github/workflows/wikiblog-ci.yml` (저장소 루트)

| ID | 요구사항 |
| --- | --- |
| A-1 | 트리거는 7절 Q2를 따른다. 모든 단계는 `working-directory: wikiblog`에서 실행한다. |
| A-2 | Node는 7절 Q3 버전을 쓴다. pnpm은 `packageManager`와 같은 10.30.0이다(`pnpm/action-setup`). pnpm 저장소를 캐시하고 `pnpm install --frozen-lockfile`로 설치한다. |
| A-3 | **정적 검사·단위 job**은 다음을 실행한다. `pnpm build:libs` → `pnpm typecheck` → `pnpm --filter @wikiblog/web typecheck` → `pnpm --filter @wikiblog/api build` → `pnpm --filter @wikiblog/api test`(단위) → `pnpm --filter @wikiblog/web test` → `pnpm --filter @wikiblog/web build` |
| A-4 | **통합 job**은 7절 Q1 방식으로 다음을 실행한다. MySQL 8.4와 Redis 7.4 준비 → 마이그레이션 → API를 백그라운드로 시작하고 `/api/health`가 `ok`일 때까지 대기(최대 60초) → `INTEGRATION_TESTS=1`로 API 테스트 실행 |
| | 대기 시간이 끝나면 API 로그를 출력하고 실패한다. |
| A-5 | **건너뛴 테스트가 있으면 통합 job을 실패시킨다.** `node --test` 결과의 `skipped` 수를 확인해 0이 아니면 실패한다. 환경 변수가 빠져 통합 테스트가 조용히 건너뛰는 일을 막기 위해서다. |
| A-6 | 비밀값을 저장소 시크릿에 두지 않는다. MySQL 비밀번호는 job 안에서 생성한 일회용 값을 쓴다. `APP_ORIGIN=http://localhost:3000`, `COOKIE_SECURE=false`를 쓰고, `TRUST_PROXY`는 설정하지 않는다. |
| A-7 | `permissions: contents: read`로 최소 권한만 준다. 외부 액션은 주요 버전 태그로 고정하고, 공식(`actions/*`)과 `pnpm/action-setup`만 쓴다. job마다 `timeout-minutes`를 둔다. 같은 브랜치에서 새 실행이 시작되면 이전 실행을 취소한다(`concurrency`). |
| A-8 | 요청 제한 카운터는 실행마다 새 Redis를 쓰므로 실행 간에 남지 않는다. 테스트가 가입을 늘려 15분 20회를 넘을 수 있으면 보고한다. **제한을 끄는 설정은 추가하지 않는다.** |

### B. 로컬 재현 검증

| ID | 요구사항 |
| --- | --- |
| B-1 | 워크플로의 명령을 깨끗한 `node:<Q3 버전>` 컨테이너에서 같은 순서로 실행해 통과를 확인한다. 통합 job은 임시 MySQL·Redis 컨테이너를 쓰고, 끝나면 정리한다. |
| | 이 worktree의 개발 스택(`wikiblog-wt`)과 메인 체크아웃 스택은 건드리지 않는다. |
| B-2 | YAML 문법과 워크플로 구조를 검사한다(`actionlint`가 있으면 사용, 없으면 YAML 파서로 확인). 실제 GitHub 실행 여부는 Q4 승인 후 확인한다. |
| B-3 | 테스트 하나를 일부러 실패시키거나 `INTEGRATION_TESTS`를 빼서, A-5의 실패 동작을 로컬에서 확인한다. 확인한 뒤에는 되돌린다. |

### C. 문서

| ID | 요구사항 |
| --- | --- |
| C-1 | README에 CI 절을 추가한다: 실행 조건, job 구성, 로컬에서 같은 검사를 돌리는 방법. 설계안 §12의 워크플로 위치 오류도 바로잡아 적는다. |
| C-2 | `CLAUDE.md`의 명령 절에 "CI와 같은 검사" 명령 묶음을 추가한다. |
| C-3 | `history.md`에 체크포인트, 마일스톤, 검증 기록을 남긴다. 실제 GitHub 실행 결과가 없으면 "로컬 재현만"이라고 적는다. |

## 4. 범위 밖

- 브랜치 보호와 필수 상태 검사 설정(GitHub 저장소 설정은 사용자가 직접 한다)
- E2E·브라우저 테스트 (운영 3 E2E)
- 린터·포매터 도입, 커버리지 기준
- 이미지 빌드·배포·릴리스 자동화 (운영 배포 체크리스트)
- 의존성 취약점 검사 (후속 검토)

## 5. 수용 기준

- [ ] PR과 `main` push에서 정적 검사·단위 job과 통합 job이 실행된다(Q2 조건).
- [ ] 통합 job은 실제 MySQL·Redis와 실행 중인 API를 대상으로 **건너뛴 테스트 0개**로 통과하고, 건너뛴 테스트가 생기면 실패한다.
- [ ] 비밀값이 저장소나 로그에 남지 않고, 워크플로 권한은 `contents: read`이다.
- [ ] 같은 명령을 깨끗한 컨테이너에서 실행해 통과를 확인했다. 실패 테스트와 누락된 환경 변수에서 실패하는 것도 확인했다.
- [ ] README, `CLAUDE.md`, history에 CI 실행 방법과 범위가 기록되어 있다.
- [ ] (Q4 승인 시) GitHub에서 실제 실행이 성공했다.

## 6. 검증

```bash
# 정적 검사·단위 (깨끗한 컨테이너에서도 같은 순서)
pnpm install --frozen-lockfile
pnpm build:libs && pnpm typecheck && pnpm --filter @wikiblog/web typecheck
pnpm --filter @wikiblog/api build
pnpm --filter @wikiblog/api test && pnpm --filter @wikiblog/web test
pnpm --filter @wikiblog/web build
```

통합 job을 재현할 때는 임시 MySQL·Redis 컨테이너를 쓴다. 순서는 마이그레이션, API 실행, 헬스 체크 대기, `INTEGRATION_TESTS=1` 테스트이며, `skipped`가 0인지도 확인한다.

## 7. 미결 질문과 추천안

### Q1. 통합 테스트 환경 구성

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | GitHub Actions 서비스 컨테이너(`mysql:8.4`, `redis:7.4-alpine`)를 쓴다. 러너에서 마이그레이션과 API(`node src/index.ts`)를 직접 실행한다. |
| B | CI에서 `docker compose up --build`로 로컬과 같은 스택을 띄우고, `docker compose exec`로 테스트한다. |

- **추천 이유**
  - 이미지 빌드가 없어 빠르다.
  - 통합 테스트가 이미 `127.0.0.1:4000`과 MySQL 환경 변수를 전제로 하므로, 그대로 맞출 수 있다.
  - 실패 로그(API 출력)를 단계별로 보기 쉽다.
- **영향**
  - Compose 구성(전용 네트워크, `TRUST_PROXY`) 자체는 CI에서 검증되지 않는다. 이 부분은 운영 배포 체크리스트에서 다룬다.
  - B는 로컬과 같지만, 빌드 시간이 길고 `.env` 생성과 정리가 추가로 필요하다.
- 결정: **A** (2026-11-18 승인)
- 구현 메모 (2026-11-18): 서비스 컨테이너의 env는 job 시작 전에 정해져 A-6(job 안에서 생성한 일회용 비밀번호)을 지킬 수 없으므로, **MySQL만 step에서 `docker run`으로 띄우고 포트를 러너 loopback에만 연다.** Redis는 서비스 컨테이너를 쓴다.

### Q2. 실행 조건

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | `pull_request`와 `main` push에서 실행한다. 경로 필터는 `wikiblog/**`와 워크플로 파일이다. 수동 실행(`workflow_dispatch`)도 허용한다. |
| B | 모든 브랜치 push에서 실행한다. |

- **추천 이유**: 병합 전 검사와 `main`의 상태 확인에 필요한 만큼만 실행한다. 루트의 다른 변경(예: `.claude/` worktree 메타데이터)에는 실행하지 않는다.
- **영향**: 경로 필터가 있으면, 필터에 걸리지 않은 PR에는 상태 검사가 아예 생기지 않는다. 나중에 브랜치 보호에서 필수 검사로 지정할 때는 이 점을 고려해야 한다.
- 결정: **A** (2026-11-18 승인)

### Q3. Node 버전

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | Node 24. Docker 이미지와 같다. |
| B | 24와 26을 매트릭스로 실행한다. |

- **추천 이유**
  - 실제 실행 환경(이미지)과 같은 버전을 검증한다.
  - API는 `node src/index.ts`로 TypeScript를 바로 실행하므로, Node 버전마다 동작이 다를 수 있다.
  - 매트릭스는 실행 시간이 두 배가 된다.
- **영향**: 개발 호스트(26)에서만 통과하고 24에서는 실패하는 코드는 CI가 잡는다. `package.json`에 `engines.node`를 추가할지는 이 결정과 함께 정한다(추천: `>=24`).
- 결정: **A** (2026-11-18 승인)

### Q4. 실제 GitHub 실행 확인

| 선택지 | 내용 |
| --- | --- |
| **A (추천)** | 로컬 재현까지 마친 뒤 사용자 승인을 받아 현재 브랜치를 push한다. 첫 실행 결과는 PR이나 Actions 화면에서 확인한다. |
| B | 로컬 재현까지만 하고, push와 첫 실행은 사용자가 직접 한다. |

- **추천 이유**: 실제 러너에서만 드러나는 문제(서비스 컨테이너 준비 시간, 캐시, 권한)를 이번 체크포인트 안에서 확인할 수 있다.
- **영향**
  - push는 외부에 공개되는 작업이다. 그래서 승인을 별도로 받는다.
  - 이 작업 환경에는 `gh`가 없으므로 실행 결과는 사용자가 GitHub 화면에서 확인해야 한다.
- 결정: **A** (2026-11-18 승인)
