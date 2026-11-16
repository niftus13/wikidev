# WikiBlog 개발 환경

Nuxt, Express, MySQL, Redis를 Docker Compose로 실행합니다. 개발용 설정이며
아직 인증, 데이터 모델, 서비스 기능은 구현하지 않았습니다.

## 실행

Docker와 Docker Compose가 필요합니다.

1. `.env.example`을 `.env`로 복사하고 두 비밀번호를 각각 안전한 임의 값으로 변경합니다.
2. `docker compose up --build -d`를 실행합니다.
3. 웹은 <http://localhost:3000>, API 상태 확인은 <http://localhost:4000/api/health>에서 확인합니다.
   웹의 `/api/health`도 개발 프록시를 통해 같은 API로 연결됩니다.
4. 중지는 `docker compose down`으로 합니다. MySQL 데이터 볼륨은 유지됩니다.

웹 앱과 API 소스는 컨테이너에 마운트되어 개발 중 변경을 반영합니다.
패키지나 설정 파일을 변경하면 `docker compose up --build -d`로 이미지를 다시 만듭니다.
MySQL과 Redis는 호스트에 포트를 공개하지 않습니다. `.env`의 MySQL 비밀번호는
최초 데이터베이스 생성 시 적용되며, 기존 볼륨이 있으면 변경만으로 갱신되지 않습니다.
