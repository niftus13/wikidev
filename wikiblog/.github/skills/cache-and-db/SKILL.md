---
name: cache-and-db
description: "Use when changing MySQL connections, transactions or migrations, or Redis clients, caching and failure handling."
---

# MySQL·Redis 변경

1. 현재 연결 풀, 마이그레이션 및 Redis 사용과 변경 대상의 데이터 소유권을 확인한다.
2. MySQL을 원본으로 두고 Redis에는 재생성 가능한 데이터만 저장한다. 공개 여부를 캐시만으로 결정하지 않는다.
3. 연결 수·반환·대기열, 트랜잭션 범위, 동시성 및 실패 시 롤백을 검토한다. 이미 적용한 migration은 수정하지 않는다.
4. 수정·재발행에 따른 캐시·검색 색인 무효화를 확인한다. 실패 시 오래된 공개 결과가 노출되지 않도록 설계한다. 발행 취소는 미결 사항(`README.md`)이므로 도입할 때 공개 조회·검색·캐시·색인 반영을 함께 설계한다.
5. 실제 MySQL·Redis 연동 테스트와 필요한 장애·동시성 검증을 실행한다. 장애 우회는 권한이나 공개 상태를 우회해서는 안 된다.
6. 실행한 검증, 장애 시 동작과 미검증 부하 조건을 보고한다.
