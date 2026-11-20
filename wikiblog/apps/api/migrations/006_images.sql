-- 이미지 첨부(MVP): 원본 바이트를 MySQL에 저장한다. 크기 상한(2 MiB)·공간 총량(50 MiB)은 API가 검사한다.
CREATE TABLE images (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY images_space_idx (space_id),
  CONSTRAINT images_space_fk FOREIGN KEY (space_id) REFERENCES spaces(id)
) ENGINE=InnoDB;
