import type { Pool, RowDataPacket } from 'mysql2/promise';

type SearchRow = RowDataPacket & {
  result_type: 'book' | 'page';
  id: string;
  title: string;
  book_id: string;
  book_slug: string;
  book_title: string;
  handle: string;
  excerpt: string;
};

export class SearchRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async search(query: string, categoryId: string | null, tag: string | null) {
    const pattern = `%${query.replace(/[!%_]/g, '!$&')}%`;
    const bookCategory = categoryId ? 'AND (b.platform_category_id IN (SELECT id FROM descendants) OR b.space_category_id IN (SELECT id FROM descendants))' : '';
    const pageCategory = categoryId ? 'AND (b.platform_category_id IN (SELECT id FROM descendants) OR b.space_category_id IN (SELECT id FROM descendants) OR v.category_id IN (SELECT id FROM descendants))' : '';
    const bookTag = tag ? 'AND EXISTS (SELECT 1 FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id AND t.normalized_name = ?)' : '';
    const pageTag = tag ? 'AND EXISTS (SELECT 1 FROM page_version_tags vt JOIN tags t ON t.id = vt.tag_id WHERE vt.version_id = v.id AND t.normalized_name = ?)' : '';
    const params: Array<string | null> = [categoryId, pattern];
    if (tag) params.push(tag);
    params.push(pattern, pattern);
    if (tag) params.push(tag);
    const [rows] = await this.pool.execute<SearchRow[]>(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
      )
      SELECT 'book' AS result_type, b.id, b.title, b.id AS book_id, b.slug AS book_slug,
        b.title AS book_title, s.handle, b.description AS excerpt
      FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE b.deleted_at IS NULL AND u.status = 'active' AND b.title LIKE ? ESCAPE '!' ${bookCategory} ${bookTag}
      UNION ALL
      SELECT 'page' AS result_type, p.id, v.title, b.id AS book_id, b.slug AS book_slug,
        b.title AS book_title, s.handle, v.body AS excerpt
      FROM pages p JOIN page_versions v ON v.id = p.published_version_id AND v.page_id = p.id
      JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE p.deleted_at IS NULL AND b.deleted_at IS NULL AND u.status = 'active'
        AND (v.title LIKE ? ESCAPE '!' OR v.body LIKE ? ESCAPE '!') ${pageCategory} ${pageTag}
      ORDER BY title, id LIMIT 50
    `, params);
    return rows;
  }
}
