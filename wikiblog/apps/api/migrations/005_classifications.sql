CREATE TABLE categories (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  scope ENUM('platform', 'space', 'book') NOT NULL,
  scope_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY categories_scope_idx (scope, scope_id, parent_id),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tags (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  normalized_name VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  UNIQUE KEY tags_space_name_unique (space_id, normalized_name),
  CONSTRAINT tags_space_fk FOREIGN KEY (space_id) REFERENCES spaces(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE books
  ADD COLUMN platform_category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN space_category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT books_platform_category_fk FOREIGN KEY (platform_category_id) REFERENCES categories(id),
  ADD CONSTRAINT books_space_category_fk FOREIGN KEY (space_category_id) REFERENCES categories(id);

ALTER TABLE page_versions
  ADD COLUMN category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT page_versions_category_fk FOREIGN KEY (category_id) REFERENCES categories(id);

CREATE TABLE book_tags (
  book_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tag_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (book_id, tag_id),
  CONSTRAINT book_tags_book_fk FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT book_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB;

CREATE TABLE page_version_tags (
  version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tag_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (version_id, tag_id),
  CONSTRAINT page_version_tags_version_fk FOREIGN KEY (version_id) REFERENCES page_versions(id),
  CONSTRAINT page_version_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB;
