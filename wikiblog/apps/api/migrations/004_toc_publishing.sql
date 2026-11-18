ALTER TABLE books ADD COLUMN toc_revision INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE pages
  ADD COLUMN parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN published_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY pages_parent_idx (book_id, parent_id, deleted_at, sort_order),
  ADD CONSTRAINT pages_parent_fk FOREIGN KEY (parent_id) REFERENCES pages(id),
  ADD CONSTRAINT pages_published_version_fk FOREIGN KEY (published_version_id) REFERENCES page_versions(id);
