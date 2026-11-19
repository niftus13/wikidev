-- 최상위 플랫폼 카테고리 시드. 고정 UUID라 다시 실행해도 같은 결과가 된다.
-- 이름·구성을 바꿀 때는 이 파일을 고치지 말고 새 migration을 추가한다(체크섬 검증).
INSERT INTO categories (id, scope, scope_id, parent_id, name) VALUES
  ('8c1f0a00-0000-4000-8000-000000000001', 'platform', NULL, NULL, '개발'),
  ('8c1f0a00-0000-4000-8000-000000000002', 'platform', NULL, NULL, '데이터·AI'),
  ('8c1f0a00-0000-4000-8000-000000000003', 'platform', NULL, NULL, '디자인'),
  ('8c1f0a00-0000-4000-8000-000000000004', 'platform', NULL, NULL, '비즈니스'),
  ('8c1f0a00-0000-4000-8000-000000000005', 'platform', NULL, NULL, '학습·교양'),
  ('8c1f0a00-0000-4000-8000-000000000006', 'platform', NULL, NULL, '일상·기타')
AS seed
ON DUPLICATE KEY UPDATE scope = seed.scope, scope_id = seed.scope_id, parent_id = seed.parent_id, name = seed.name;
