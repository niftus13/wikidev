# WikiBlog — Claude Code 지침

공통 지침은 Copilot과 같은 원본을 사용한다.

@.github/copilot-instructions.md

## 하네스 구성

`.github/`가 원본이고 `.claude/`는 Claude Code용 진입점이다.

| 구분 | Claude Code | 원본 | 방식 |
| --- | --- | --- | --- |
| 공통 지침 | `CLAUDE.md` | `.github/copilot-instructions.md` | `@` import |
| 경로별 지침 | `.claude/rules/*.md` | `.github/instructions/*.instructions.md` | 심볼릭 링크 (`paths`는 Claude, `applyTo`는 Copilot) |
| 스킬 | `.claude/skills/*` | `.github/skills/*` | 심볼릭 링크 |
| 서브에이전트 | `.claude/agents/*.md` | `.github/agents/*.agent.md` | 별도 파일 (도구 이름 형식이 달라 본문을 복사) |

- 지침·스킬은 `.github` 원본만 수정한다. 경로를 바꾸면 `applyTo`와 `paths`를 함께 갱신한다.
- 에이전트 본문을 바꾸면 `.github/agents`와 `.claude/agents`를 함께 갱신한다.

## 명령

```bash
pnpm install
pnpm build:libs                        # API·웹 테스트 전 필수
pnpm typecheck                         # libs 빌드 + API 타입 검사
pnpm --filter @wikiblog/api test       # 통합 테스트는 환경 변수 없으면 skip
pnpm --filter @wikiblog/web test
pnpm --filter @wikiblog/web typecheck
docker compose up --build -d
docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test
```

CI와 같은 검사 (워크플로: 저장소 루트 `.github/workflows/wikiblog-ci.yml`, Node 24, 설명은 README "CI"):

```bash
# 정적 검사·단위 job (같은 순서)
pnpm install --frozen-lockfile
pnpm build:libs && pnpm typecheck && pnpm --filter @wikiblog/web typecheck
pnpm --filter @wikiblog/api build
pnpm --filter @wikiblog/api test && pnpm --filter @wikiblog/web test
pnpm --filter @wikiblog/web build
# 통합 job 범위: 실제 MySQL·Redis·API 대상, 요약의 "ℹ skipped 0"을 확인 (CI는 0이 아니면 실패)
docker compose exec -T -e INTEGRATION_TESTS=1 api pnpm --filter @wikiblog/api test
```

실행 방법·API 계약·미결 사항은 `README.md`, 구현 진행 상황은 `history.md`를 확인한다.
