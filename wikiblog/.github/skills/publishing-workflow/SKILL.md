---
name: publishing-workflow
description: "Use when changing drafts, publishing, version restore, table of contents, public search, or published page classifications."
---

# 발행 흐름 변경

1. `README.md`에서 구현 여부와 미결 정책을 확인하고 초안·발행본·이력·revision의 계약을 정의한다.
2. 초안과 이력 저장의 원자성, 오래된 revision의 충돌 응답과 사용자 입력 보존을 검토한다.
3. 복원이 새 초안 이력을 생성하고 공개본을 즉시 바꾸지 않는지 확인한다.
4. 목차와 분류의 범위·순환 및 동시 이동, 발행 버전의 카테고리·태그 스냅샷을 검토한다.
5. 공개 조회·목차·검색이 발행본만 반환하고 재발행 후 캐시나 색인이 이전 결과를 노출하지 않도록 검증한다. 발행 취소(`POST /pages/{id}/unpublish`, 하위 발행 페이지 함께 취소)는 공개 조회·목차·검색·분류 필터에서 즉시 빠지는지 검증한다. 삭제 복구는 보류 상태이므로 구현된 것으로 가정하지 않는다.
6. 소유권, 원자성, 충돌, 복원과 발행 전후 결과를 실제 DB를 사용하는 관련 테스트로 확인하고 문서를 갱신한다.
