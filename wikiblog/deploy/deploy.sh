#!/usr/bin/env bash
# WikiBlog 운영 배포 (요구사항: docs/checkpoints/ops-deploy.md D-1·D-2, 런북: deploy/README.md)
#
#   deploy/deploy.sh <git 태그 또는 커밋>
#
# 순서: 체크아웃 → 커밋 태그로 이미지 빌드 → MySQL·Redis 준비 → 새 이미지로 일회성 migrate(실패 시 중단, 서비스 그대로)
#       → web·api 교체(up -d) → /api/health·웹 SSR(/) 헬스 체크 → 실패하면 이전 태그의 이미지로 되돌린다.
# 마이그레이션은 앞으로만 진행한다(체크섬 검증). 롤백은 애플리케이션 이미지만 되돌리고 스키마는 되돌리지 않는다.
#
# 환경 변수(선택):
#   WIKIBLOG_ENV_FILE        운영 환경 파일 (기본: <wikiblog>/.env.production)
#   COMPOSE_PROJECT_NAME     Compose 프로젝트 이름 (기본: wikiblog-prod)
#   WIKIBLOG_HEALTH_TIMEOUT  헬스 체크 대기 초 (기본: 120)
#   DOCKER                   docker 명령 (기본: docker)
# 로컬 재현 전용(운영에서 쓰지 않는다):
#   WIKIBLOG_DEPLOY_NO_CHECKOUT=1  git 체크아웃을 하지 않고 인자를 그대로 이미지 태그로 쓴다
#   WIKIBLOG_DEPLOY_NO_BUILD=1     이미지를 빌드하지 않는다(이미 있는 태그를 배포)

set -Eeuo pipefail

# 체크아웃으로 이 파일이 바뀌어도 이미 읽은 함수가 실행되도록 본문 전체를 함수로 둔다.
main() {
  local ref="${1:-}"
  if [[ -z "$ref" || $# -ne 1 ]]; then
    echo "usage: $0 <git-tag-or-commit>" >&2
    exit 64
  fi

  local app_dir
  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$app_dir"

  DOCKER="${DOCKER:-docker}"
  ENV_FILE="${WIKIBLOG_ENV_FILE:-$app_dir/.env.production}"
  PROJECT="${COMPOSE_PROJECT_NAME:-wikiblog-prod}"
  HEALTH_TIMEOUT="${WIKIBLOG_HEALTH_TIMEOUT:-120}"
  STATE_DIR="$app_dir/.deploy"

  [[ -f "$ENV_FILE" ]] || die "environment file not found: $ENV_FILE (copy .env.production.example)"
  if [[ "$(stat -c '%a' "$ENV_FILE")" != 600 ]]; then
    log "warning: $ENV_FILE permissions are $(stat -c '%a' "$ENV_FILE"), expected 600"
  fi
  local web_port
  web_port="$(sed -nE 's/^WEB_HOST_PORT=([0-9]+)[[:space:]]*$/\1/p' "$ENV_FILE" | tail -n 1)"
  WEB_URL="http://127.0.0.1:${web_port:-3000}"

  mkdir -p "$STATE_DIR"
  # 동시에 두 배포가 돌지 않게 한다.
  exec 9> "$STATE_DIR/lock"
  flock -n 9 || die "another deploy is running"

  local previous
  previous="$(current_tag)"
  log "current tag: ${previous:-<none>}"

  local tag
  if [[ "${WIKIBLOG_DEPLOY_NO_CHECKOUT:-}" == 1 ]]; then
    tag="$ref"
  else
    if ! git -C "$app_dir" diff --quiet || ! git -C "$app_dir" diff --cached --quiet; then
      die "working tree has local changes; refusing to check out"
    fi
    git -C "$app_dir" fetch --tags --prune origin
    git -C "$app_dir" checkout --detach "$ref" --
    tag="$(git -C "$app_dir" rev-parse --short=12 HEAD)"
  fi
  [[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "invalid image tag: $tag"
  log "deploying $ref as tag $tag"

  if [[ "${WIKIBLOG_DEPLOY_NO_BUILD:-}" != 1 ]]; then
    log "building images"
    WIKIBLOG_TAG="$tag" compose build web api
  fi

  log "starting mysql and redis"
  # 첫 배포는 MySQL 초기화가 길어 넉넉히 기다린다.
  WIKIBLOG_TAG="$tag" compose up -d --wait --wait-timeout 300 mysql redis

  # 서비스를 바꾸기 전에 새 이미지로 마이그레이션한다. 실패하면 여기서 멈추고 기존 서비스는 그대로 둔다.
  log "running migrations with tag $tag"
  if ! WIKIBLOG_TAG="$tag" compose run --rm --no-deps -T api node src/migrate.ts; then
    die "migration failed; services were not changed (still ${previous:-<none>})"
  fi

  log "replacing web and api with tag $tag"
  if WIKIBLOG_TAG="$tag" compose up -d --no-build --wait --wait-timeout "$HEALTH_TIMEOUT" web api && healthy; then
    echo "$tag" > "$STATE_DIR/current-tag"
    log "deploy succeeded: $tag"
    return 0
  fi

  log "health check failed for $tag"
  WIKIBLOG_TAG="$tag" compose logs --no-color --tail 50 web api >&2 || true
  if [[ -z "$previous" ]]; then
    die "no previous tag to roll back to"
  fi
  log "rolling back application images to $previous (schema is not rolled back)"
  if [[ "${WIKIBLOG_DEPLOY_NO_CHECKOUT:-}" != 1 ]] && git -C "$app_dir" rev-parse --verify --quiet "$previous^{commit}" > /dev/null; then
    git -C "$app_dir" checkout --detach "$previous" --
  fi
  if WIKIBLOG_TAG="$previous" compose up -d --no-build --wait --wait-timeout "$HEALTH_TIMEOUT" web api && healthy; then
    echo "$previous" > "$STATE_DIR/current-tag"
    die "deploy of $tag failed; rolled back to $previous"
  fi
  die "deploy of $tag failed and rollback to $previous is not healthy; check 'docker compose -p $PROJECT logs'"
}

compose() {
  "$DOCKER" compose -p "$PROJECT" --env-file "$ENV_FILE" -f compose.prod.yaml "$@"
}

# 실행 중인 web 컨테이너의 이미지 태그(없으면 마지막으로 성공한 기록).
current_tag() {
  local id image
  id="$(WIKIBLOG_TAG=unused compose ps -q web 2> /dev/null || true)"
  if [[ -n "$id" ]]; then
    image="$("$DOCKER" inspect --format '{{.Config.Image}}' "$id" 2> /dev/null || true)"
    if [[ "$image" == *:* ]]; then
      echo "${image##*:}"
      return
    fi
  fi
  if [[ -f "$STATE_DIR/current-tag" ]]; then
    cat "$STATE_DIR/current-tag"
  fi
}

# nginx와 같은 경로(호스트 loopback 공개 포트)로 API 헬스와 공개 SSR을 확인한다.
healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while ((SECONDS < deadline)); do
    if curl --silent --fail --max-time 5 "$WEB_URL/api/health" | grep -q '"status":"ok"' \
      && [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "$WEB_URL/")" == 200 ]]; then
      log "health ok: $WEB_URL/api/health and SSR $WEB_URL/"
      return 0
    fi
    sleep 3
  done
  return 1
}

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "error: $*"; exit 1; }

main "$@"
exit
