# WikiBlog 운영 배포 런북 (EC2 · Docker · 호스트 nginx)

CDN은 아직 두지 않으므로 nginx가 첫 hop이다.
아래의 `<도메인>`, `<관리자 IP>`, `<저장소 SSH 주소>`, `<태그>`는 실제 값으로 바꾼다. AWS 작업(EC2·보안 그룹·DNS·DLM)은 운영자가 직접 한다.

```text
클라이언트 ─▶ 보안 그룹(80·443) ─▶ nginx(호스트, TLS) ─▶ 127.0.0.1:3000 ─▶ web(.output) ─▶ api ─▶ mysql·redis
                                    XFF = $remote_addr     게이트웨이 10.231.0.1   XFF 이어받기   TRUST_PROXY = web 10.231.0.6
```

| 파일 | 역할 |
| --- | --- |
| `Dockerfile.prod` | 운영 이미지(target `web`: `nuxt build` 산출물 `.output`, target `api`: `src`·`migrations`·운영 의존성). Node 24, non-root |
| `compose.prod.yaml` | 운영 Compose. web만 `127.0.0.1:3000`에 공개, 나머지는 비공개. 재시작·헬스 체크·로그 순환 |
| `.env.production.example` | 운영 환경 변수 예시. 인스턴스에서 `.env.production`(600)으로 복사 |
| `deploy/nginx/wikiblog.conf` | 호스트 nginx 설정 |
| `deploy/deploy.sh` | 배포·롤백 스크립트 |

## 1. 권장 구성

| 항목 | 권장 | 이유 |
| --- | --- | --- |
| 인스턴스 | **t3.medium**(2 vCPU, 4 GiB), x86_64 | 인스턴스에서 직접 `nuxt build`를 하므로 메모리 2 GiB 이상이 필요하다. MySQL·Redis·웹·API를 함께 둔다 |
| OS | **Ubuntu 24.04 LTS** | Docker 공식 apt 저장소, nginx·certbot 패키지 |
| 접속 | **SSM Session Manager**(인스턴스 프로파일 `AmazonSSMManagedInstanceCore`) | SSH 포트를 닫을 수 있다. SSH를 쓰면 `<관리자 IP>/32`만 연다 |
| 저장소 접근 | 읽기 전용 **deploy key**(저장소 전용 SSH 키) | 인스턴스에 개인 자격 증명·토큰을 두지 않는다 |
| 디스크 | 루트 EBS(gp3 20 GiB) + **데이터 EBS 분리**(gp3, 암호화, 예: 30 GiB) — Docker `data-root`를 데이터 볼륨에 둔다 | MySQL 볼륨·이미지를 루트와 분리해 스냅샷·확장을 따로 한다 |
| 주소 | **Elastic IP** | 도메인 A 레코드가 바뀌지 않는다 |
| swap | 2 GiB 파일 | 빌드 중 메모리 부족 방지 |

디스크 용량: 이미지는 MySQL `images` 테이블(MEDIUMBLOB)에 저장된다. 장당 최대 2 MiB, 공간당 최대 50 MiB이므로
데이터 볼륨은 `활성 공간 수 × 50 MiB` + MySQL 데이터·binlog + 덤프 보관분(hex로 약 2배) + Docker 이미지(빌드 캐시 포함 수 GiB)를 상한으로 잡는다.
고아 이미지는 지우지 않으므로 사용량은 줄지 않는다(정리는 후속 작업).

## 2. 보안 그룹과 포트 정책

| 방향 | 포트 | 출처 | 비고 |
| --- | --- | --- | --- |
| 인바운드 | 80/tcp | 0.0.0.0/0, ::/0 | HTTPS 리다이렉트, Let's Encrypt HTTP-01 |
| 인바운드 | 443/tcp | 0.0.0.0/0, ::/0 | 서비스 |
| 인바운드 | 22/tcp | `<관리자 IP>/32`만 (SSM을 쓰면 규칙 없음) | |
| 인바운드 | 3000·4000·3306·6379 | **열지 않는다** | |
| 아웃바운드 | 전체(기본) | | 패키지·이미지·certbot·git |

호스트 방화벽 없이도 웹이 loopback에만 열려 있는지 확인한다. API·MySQL·Redis는 호스트 포트가 없어야 한다.

```bash
sudo ss -ltnp | grep -E ':(80|443|3000|4000|3306|6379)\b'
# 기대: 0.0.0.0:80·443(nginx), 127.0.0.1:3000(docker-proxy)만. 4000·3306·6379는 없다.
docker ps --format '{{.Names}} {{.Ports}}'
# 기대: web만 127.0.0.1:3000->3000/tcp
```

**신뢰의 전제**: 웹은 Docker 게이트웨이(`WEB_GATEWAY_IP`, 기본 `10.231.0.1`)에서 온 연결의 `X-Forwarded-For`를 믿는다.
이 주소는 호스트에서 `127.0.0.1:3000`으로 오는 **모든** 연결의 출발 주소이므로, 호스트에서 프로세스를 실행할 수 있는 사람은
요청 제한 키를 바꿀 수 있다. 같은 호스트의 **다른 Docker 네트워크 컨테이너**가 웹 컨테이너 주소(`10.231.0.6:3000`)로 직접 접속해도
Docker가 게이트웨이 주소로 SNAT하므로 같은 효과가 난다(로컬 재현에서 확인). 따라서 다음이 이 신뢰의 전제다.

- 호스트 접근(보안 그룹, SSH·SSM 권한, `docker` 그룹)을 운영자로 제한한다.
- 인스턴스에는 이 Compose 스택 외의 컨테이너를 실행하지 않는다.
- EC2의 원본/대상 확인(source/destination check)을 끄지 않는다. 켜져 있으면 다른 호스트가 Docker 대역(`10.231.0.0/29` 등)으로
  패킷을 보내도 인스턴스가 받지 않는다. VPC 라우팅 테이블에 이 대역을 인스턴스로 보내는 경로를 만들지 않는다.

## 3. 인스턴스 준비 (처음 한 번)

```bash
# 3-1. 데이터 볼륨(예: /dev/nvme1n1)을 /data에 마운트 (lsblk로 장치 이름 확인)
sudo mkfs.ext4 -L wikiblog-data /dev/nvme1n1
sudo mkdir -p /data && echo 'LABEL=wikiblog-data /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab && sudo mount -a

# 3-2. swap 2 GiB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3-3. Docker Engine과 Compose 플러그인(공식 apt 저장소: https://docs.docker.com/engine/install/ubuntu/)
#      설치 전에 data-root를 데이터 볼륨으로 지정한다.
sudo mkdir -p /etc/docker /data/docker
echo '{ "data-root": "/data/docker" }' | sudo tee /etc/docker/daemon.json
# (공식 문서의 apt 저장소 등록 후)
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker compose version   # v2.20 이상(up --wait 사용)

# 3-4. nginx, certbot, git
sudo apt-get install -y nginx certbot git

# 3-5. 배포 사용자(docker 그룹 = 사실상 root 권한이므로 운영자만)
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
```

저장소 체크아웃(deploy key):

```bash
sudo -iu deploy
ssh-keygen -t ed25519 -f ~/.ssh/wikiblog_deploy -N ''     # 공개 키를 저장소 Deploy keys(읽기 전용)에 등록
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/wikiblog_deploy
  IdentitiesOnly yes
EOF
git clone <저장소 SSH 주소> ~/wikis
cd ~/wikis/wikiblog
cp .env.production.example .env.production && chmod 600 .env.production
# .env.production: APP_DOMAIN=<도메인>, 비밀번호 2개(openssl rand -hex 24), 필요하면 WEB_API_SUBNET 등
```

`WEB_API_SUBNET`(기본 `10.231.0.0/29`)이 VPC CIDR·피어링 대역과 겹치면 `.env.production`에서 대역과
`WEB_GATEWAY_IP`(대역의 첫 주소), `WEB_PROXY_IP`(대역의 마지막 주소)를 함께 바꾼다.

## 4. 도메인과 인증서

1. Elastic IP를 인스턴스에 연결하고, DNS에서 `<도메인>`의 A 레코드(필요하면 AAAA)를 그 주소로 둔다.
2. 처음에는 인증서가 없으므로 80만 여는 임시 설정으로 nginx를 띄우고 발급한다.

```bash
sudo mkdir -p /var/www/certbot
sudo rm -f /etc/nginx/sites-enabled/default
# 임시: 80 server 블록만 (웹 루트 확인용)
sudo tee /etc/nginx/sites-available/wikiblog-bootstrap > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name <도메인>;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; default_type text/plain; }
    location / { return 404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/wikiblog-bootstrap /etc/nginx/sites-enabled/wikiblog-bootstrap
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d <도메인> --email <운영자 메일> --agree-tos --no-eff-email

# 실제 설정으로 교체
sudo rm /etc/nginx/sites-enabled/wikiblog-bootstrap
sudo sed 's/<도메인>/'"<도메인>"'/g' ~deploy/wikis/wikiblog/deploy/nginx/wikiblog.conf | sudo tee /etc/nginx/sites-available/wikiblog > /dev/null
sudo ln -sf /etc/nginx/sites-available/wikiblog /etc/nginx/sites-enabled/wikiblog
sudo nginx -t && sudo systemctl reload nginx
```

자동 갱신: certbot 패키지의 systemd 타이머(`certbot.timer`)가 하루 두 번 갱신을 시도한다. 갱신 후 nginx가 새 인증서를
읽도록 deploy hook을 둔다.

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl list-timers certbot.timer
sudo certbot renew --dry-run
```

nginx 설정 요약(`deploy/nginx/wikiblog.conf`): TLS 1.2·1.3, HSTS(`max-age=31536000`), 80은 HTTPS 리다이렉트(갱신 경로 제외),
모르는 Host는 응답하지 않음, 본문 상한 64k(이미지 업로드 `POST /api/v1/me/images`만 3m — API 상한 2 MiB의 JSON 413이 그대로 보인다),
upstream 시간 제한 60초(웹 `/api` 프록시 30초보다 김), `X-Forwarded-For`를 `$remote_addr`로 덮어쓰고 `X-Real-IP`·`Forwarded`를 지움,
`/_nuxt/*`만 `Cache-Control: public, max-age=31536000, immutable`. 그 밖의 경로는 캐시 헤더를 추가하지 않는다.

## 5. 첫 배포

```bash
sudo -iu deploy
cd ~/wikis/wikiblog
deploy/deploy.sh <태그>          # 예: v0.1.0 또는 커밋 해시
```

`deploy.sh`가 하는 일: `git fetch` → 지정한 태그·커밋을 detached로 체크아웃(로컬 변경이 있으면 중단) → 커밋 해시(12자리)로
`wikiblog-web:<커밋>`·`wikiblog-api:<커밋>` 빌드 → MySQL·Redis 기동 대기 → **새 이미지로 일회성 `migrate` 컨테이너**(실패하면 중단하고
기존 서비스는 그대로) → web·api 교체(`up -d --wait`) → `http://127.0.0.1:3000/api/health`와 공개 SSR `/` 200 확인 →
실패하면 이전 태그로 되돌림. 성공한 태그는 `.deploy/current-tag`에 남는다. 첫 배포는 되돌릴 이전 태그가 없다.

배포 후 확인:

```bash
curl -sI https://<도메인>/ | head -5                       # 200, strict-transport-security
curl -s https://<도메인>/api/health                         # {"status":"ok",...}
curl -sI https://<도메인>/_nuxt/<HTML에 있는 파일> | grep -i cache-control   # public, max-age=31536000, immutable
curl -sI http://<도메인>/ | head -3                         # 301 https://<도메인>/
```

**클라이언트 IP 신뢰 체인 확인**(처음 한 번): 자신의 브라우저에서 틀린 비밀번호로 로그인을 1회 시도한 뒤 요청 제한 키를 **읽기만** 한다.
키가 자신의 공인 IP여야 한다. `10.231.0.x`(게이트웨이·웹 주소)이면 신뢰 설정이 맞지 않는 것이다. 카운터는 지우지 않는다.

```bash
docker compose -p wikiblog-prod --env-file .env.production -f compose.prod.yaml exec -T redis redis-cli --scan --pattern 'auth-rate:*'
```

## 6. 정기 배포

```bash
cd ~/wikis/wikiblog && deploy/deploy.sh <새 태그>
```

- 마이그레이션은 서비스 교체 **전에** 실행되므로, 새 스키마는 **이전 버전 API와도 호환**되어야 한다(열·테이블 추가는 가능,
  이름 변경·삭제·타입 축소는 여러 배포로 나눈다).
- 마이그레이션은 앞으로만 진행하고 체크섬으로 검증한다. 이미 적용된 migration 파일을 고치면 `Applied migration changed`로 배포가 멈춘다.
- 빌드 중에는 CPU를 많이 쓰므로 사용량이 적은 시간에 배포한다.
- 오래된 이미지 정리: 현재·직전 태그는 남긴다.
  `docker image ls 'wikiblog-*'`로 확인한 뒤 필요 없는 태그만 `docker image rm wikiblog-web:<커밋> wikiblog-api:<커밋>`, 빌드 캐시는 `docker builder prune`.

## 7. 롤백

- 헬스 체크가 실패하면 `deploy.sh`가 자동으로 직전 태그의 **애플리케이션 이미지**로 되돌리고 실패로 끝난다.
- 수동 롤백: 직전 태그를 다시 배포한다(이미지가 남아 있으면 빌드는 캐시로 빠르다). `deploy/deploy.sh <이전 태그>`
- **스키마는 되돌리지 않는다.** 롤백한 이전 버전은 새 스키마 위에서 동작해야 하므로(6절의 호환 원칙), 되돌릴 수 없는 스키마 변경
  (열 삭제, 데이터 변환)은 배포 전에 따로 검토하고 백업을 먼저 받는다.
- 마이그레이션 실패 시: 서비스는 바뀌지 않았다. 로그의 오류를 확인하고 수정한 새 migration으로 다시 배포한다. 일부 문장만 적용된 경우
  (MySQL DDL은 트랜잭션으로 묶이지 않는다) 상태를 확인하고 수동으로 정리한 뒤 다시 실행한다.

## 8. 로그

```bash
C="docker compose -p wikiblog-prod --env-file .env.production -f compose.prod.yaml"
$C ps                                  # 상태·헬스
$C logs --tail 200 -f web api          # 앱 로그(json-file, 서비스당 10 MiB × 5개 순환)
$C logs --tail 200 mysql
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

## 9. DB 비밀번호 변경

`.env.production`의 비밀번호는 MySQL 볼륨을 **처음 만들 때만** 적용된다. 값만 바꾸면 API가 접속하지 못한다. 순서:

```bash
C="docker compose -p wikiblog-prod --env-file .env.production -f compose.prod.yaml"
new="$(openssl rand -hex 24)"
# 1) MySQL에서 먼저 바꾼다(현재 root 비밀번호로 접속, 비밀번호는 프롬프트로 입력해 셸 기록에 남기지 않는다)
$C exec mysql mysql -u root -p -e "ALTER USER 'wikiblog'@'%' IDENTIFIED BY '$new';"
# 2) .env.production의 MYSQL_PASSWORD를 같은 값으로 바꾼다(편집기 사용)
# 3) api를 새 값으로 다시 만든다(web은 그대로)
WIKIBLOG_TAG="$(cat .deploy/current-tag)" $C up -d --no-deps --wait api
```

root 비밀번호도 같은 방식(`ALTER USER 'root'@'%' ...`, `'root'@'localhost'`도 함께)으로 바꾸고 `MYSQL_ROOT_PASSWORD`를 갱신한다
(mysql 헬스 체크가 이 값을 쓴다 — `$C up -d --wait mysql`로 다시 만든다).

## 10. 운영 작업 (SQL)

MySQL 접속: `$C exec mysql mysql -u root -p wikiblog`. 작업 전에 백업(11절)을 받는다.

**사용자 비활성화(신고 대응)** — 신고 기능은 없고 운영자가 비활성화한다. 비활성 사용자의 공간·책·페이지·이미지 조회는 404가 되고,
기존 세션도 더 이상 인정되지 않는다(세션 조회가 `status = 'active'`를 확인).

```sql
SELECT u.id, u.email, u.status, s.handle FROM users u JOIN spaces s ON s.owner_id = u.id WHERE s.handle = '<handle>';
UPDATE users SET status = 'disabled' WHERE id = '<user id>';
DELETE FROM sessions WHERE user_id = '<user id>';           -- 세션 행 정리(선택)
-- 되돌리기: UPDATE users SET status = 'active' WHERE id = '<user id>';
```

이미지 응답은 `Cache-Control: public, max-age=31536000, immutable`이므로 이미 받은 브라우저에는 캐시가 남을 수 있다(CDN이 없어 공유 캐시는 없다).

**이미지 수동 삭제**(문제 이미지 한 장) — 삭제 API는 없다. 본문에 남은 `![...](/api/v1/images/<id>)`는 깨진 이미지로 보인다.

```sql
SELECT i.id, i.content_type, i.byte_size, i.created_at, s.handle
  FROM images i JOIN spaces s ON s.id = i.space_id WHERE i.id = '<image id>';
DELETE FROM images WHERE id = '<image id>';
```

**사용량 확인**:

```sql
SELECT COUNT(*) AS images, SUM(byte_size) AS bytes FROM images;
SELECT s.handle, COUNT(*) AS images, SUM(i.byte_size) AS bytes
  FROM images i JOIN spaces s ON s.id = i.space_id GROUP BY s.handle ORDER BY bytes DESC LIMIT 20;
```

## 11. 백업과 복구 (최소)

두 가지를 함께 쓴다. 정기 복구 연습과 모니터링은 운영 4에서 다룬다.

**EBS 스냅샷(DLM)**: AWS 콘솔 → EC2 → Lifecycle Manager → 스냅샷 정책. 대상은 데이터 볼륨 태그(예: `Backup=wikiblog`),
매일 1회, 보존 7개. 실행 중 스냅샷은 crash-consistent이므로 InnoDB 복구에 기대며, 논리 백업(mysqldump)을 함께 둔다.

**mysqldump 일일 실행** — 이미지(BLOB)가 들어 있으므로 `--hex-blob`을 쓰고, 덤프 크기는 이미지 바이트의 약 2배가 된다.

```bash
sudo install -d -o deploy -g deploy -m 700 /data/backups
sudo -iu deploy tee ~/wikis/../backup-mysql.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd ~/wikis/wikiblog
C="docker compose -p wikiblog-prod --env-file .env.production -f compose.prod.yaml"
out="/data/backups/wikiblog-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
# 컨테이너 안의 MYSQL_ROOT_PASSWORD를 MYSQL_PWD로 넘긴다(명령줄·셸 기록에 비밀번호가 남지 않는다).
$C exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -u root --single-transaction --hex-blob --routines --triggers --databases wikiblog' \
  | gzip > "$out.part"
mv "$out.part" "$out"
find /data/backups -name 'wikiblog-*.sql.gz' -mtime +7 -delete
EOF
sudo -iu deploy chmod 700 ~deploy/backup-mysql.sh
# 매일 18:30 UTC (KST 03:30)
echo '30 18 * * * deploy /home/deploy/backup-mysql.sh >> /home/deploy/backup-mysql.log 2>&1' | sudo tee /etc/cron.d/wikiblog-backup
```

덤프는 같은 인스턴스·볼륨에 있으므로 인스턴스를 잃으면 함께 잃는다. 다른 위치(S3 등)로의 복사는 후속 작업이며, 그 전까지는 DLM 스냅샷이 외부 사본이다.

**복구 초안**(덤프에서):

```bash
C="docker compose -p wikiblog-prod --env-file .env.production -f compose.prod.yaml"
$C stop web api                                     # 쓰기 중단
gunzip -c /data/backups/wikiblog-<시각>.sql.gz | $C exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root'
WIKIBLOG_TAG="$(cat .deploy/current-tag)" $C up -d --wait web api
```

덤프는 `--databases wikiblog`라 `DROP`/`CREATE DATABASE`를 포함하지 않으므로, 깨끗하게 복구하려면 먼저
`DROP DATABASE wikiblog; CREATE DATABASE wikiblog;`(앱 사용자 권한은 유지된다)를 실행한다.
**스냅샷에서**: 스냅샷으로 새 볼륨을 만들고 → 인스턴스에서 `docker` 중지 → 기존 데이터 볼륨 분리·새 볼륨을 `/data`에 연결 → `docker` 시작 →
`deploy.sh <현재 태그>`로 헬스 확인. 복구 후 세션은 덤프 시점 기준이며, 요청 제한 카운터(Redis)는 비어 있다.

## 12. 디스크 사용량

```bash
df -h / /data
docker system df                       # 이미지·컨테이너·볼륨·빌드 캐시
sudo du -sh /data/docker/volumes/wikiblog-prod_mysql-data /data/backups
```

```sql
SELECT table_name, ROUND((data_length + index_length) / 1024 / 1024, 1) AS mib
  FROM information_schema.tables WHERE table_schema = 'wikiblog' ORDER BY mib DESC;
```

## 13. CDN을 도입할 때

이 구성은 nginx가 첫 hop이라는 전제다. CDN을 앞에 두면 nginx의 `X-Forwarded-For $remote_addr` 덮어쓰기가 CDN 주소로 바뀌므로,
`real_ip`(CDN이 전달하는 클라이언트 주소 헤더), CDN IP 대역, 오리진 인증 헤더, 보안 그룹 prefix list를 다시 설계한다.
CDN 캐시는 `/_nuxt/*`만 길게 두고 `/api/*`·로그인·관리 화면은 캐시하지 않는다.
