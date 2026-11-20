import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { CategoryEntity, TagEntity } from '@wikiblog/entities';
import type { BookClassificationInput } from '@wikiblog/dto';
import { HttpError } from '../services/errors.ts';
import { transaction } from './transaction.ts';

type CategoryRow = RowDataPacket & CategoryEntity;
type TagRow = RowDataPacket & TagEntity;
type IdRow = RowDataPacket & { id: string };
type CategoryScope = 'space' | 'book';

export class ClassificationRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async lockSpace(connection: PoolConnection, spaceId: string) {
    const [rows] = await connection.execute<IdRow[]>('SELECT id FROM spaces WHERE id = ? FOR UPDATE', [spaceId]);
    if (!rows[0]) throw new HttpError(404, 'Space not found');
  }

  private async lockBook(connection: PoolConnection, bookId: string, spaceId: string) {
    const [rows] = await connection.execute<IdRow[]>(
      'SELECT id FROM books WHERE id = ? AND space_id = ? AND deleted_at IS NULL FOR UPDATE', [bookId, spaceId],
    );
    if (!rows[0]) throw new HttpError(404, 'Book not found');
  }

  private async lockScope(connection: PoolConnection, scope: CategoryScope, scopeId: string, spaceId: string) {
    await this.lockSpace(connection, spaceId);
    if (scope === 'book') await this.lockBook(connection, scopeId, spaceId);
    else if (scopeId !== spaceId) throw new HttpError(404, 'Space not found');
  }

  async platformCategories() {
    const [rows] = await this.pool.execute<CategoryRow[]>(
      "SELECT * FROM categories WHERE scope = 'platform' ORDER BY name, id",
    );
    return rows;
  }

  async discoverCategories() {
    const [rows] = await this.pool.query<Array<CategoryRow & { scope_label: string | null }>>(`
      WITH RECURSIVE visible AS (
        SELECT id, parent_id FROM categories WHERE scope = 'platform'
        UNION DISTINCT
        SELECT c.id, c.parent_id FROM categories c JOIN books b ON b.space_category_id = c.id
        JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
        WHERE b.deleted_at IS NULL AND u.status = 'active'
        UNION DISTINCT
        SELECT c.id, c.parent_id FROM categories c JOIN page_versions v ON v.category_id = c.id
        JOIN pages p ON p.published_version_id = v.id AND p.deleted_at IS NULL
        JOIN books b ON b.id = p.book_id AND b.deleted_at IS NULL
        JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id AND u.status = 'active'
        UNION DISTINCT
        SELECT c.id, c.parent_id FROM categories c JOIN visible v ON c.id = v.parent_id
      )
      SELECT c.*, CASE WHEN c.scope = 'space' THEN s.handle
        WHEN c.scope = 'book' THEN CONCAT(bs.handle, ' / ', b.title) ELSE NULL END AS scope_label
      FROM visible v JOIN categories c ON c.id = v.id
      LEFT JOIN spaces s ON c.scope = 'space' AND s.id = c.scope_id
      LEFT JOIN books b ON c.scope = 'book' AND b.id = c.scope_id
      LEFT JOIN spaces bs ON bs.id = b.space_id
      ORDER BY c.scope, scope_label, c.name, c.id
    `);
    return rows;
  }

  async categories(scope: CategoryScope, scopeId: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockScope(connection, scope, scopeId, spaceId);
      const [rows] = await connection.execute<CategoryRow[]>(
        'SELECT * FROM categories WHERE scope = ? AND scope_id = ? ORDER BY name, id', [scope, scopeId],
      );
      return rows;
    });
  }

  async saveCategory(scope: CategoryScope, scopeId: string, spaceId: string, id: string | null, name: string, parentId: string | null) {
    return transaction(this.pool, async (connection) => {
      await this.lockScope(connection, scope, scopeId, spaceId);
      const [rows] = await connection.execute<CategoryRow[]>(
        'SELECT * FROM categories WHERE scope = ? AND scope_id = ? FOR UPDATE', [scope, scopeId],
      );
      const nodes = new Map(rows.map((row) => [row.id, row]));
      if (id && !nodes.has(id)) throw new HttpError(404, 'Category not found');
      if (parentId && !nodes.has(parentId)) throw new HttpError(404, 'Parent category not found');
      let ancestor = parentId;
      while (ancestor) {
        if (ancestor === id) throw new HttpError(400, 'Category hierarchy cannot contain a cycle');
        const node = nodes.get(ancestor);
        if (!node) throw new Error('Invalid category hierarchy');
        ancestor = node.parent_id;
      }
      const categoryId = id ?? randomUUID();
      if (id) {
        await connection.execute('UPDATE categories SET name = ?, parent_id = ? WHERE id = ?', [name, parentId, id]);
      } else {
        await connection.execute('INSERT INTO categories (id, scope, scope_id, parent_id, name) VALUES (?, ?, ?, ?, ?)',
          [categoryId, scope, scopeId, parentId, name]);
      }
      return { id: categoryId, scope, parent_id: parentId, name };
    });
  }

  async deleteCategory(scope: CategoryScope, scopeId: string, spaceId: string, id: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockScope(connection, scope, scopeId, spaceId);
      const [rows] = await connection.execute<IdRow[]>(
        'SELECT id FROM categories WHERE id = ? AND scope = ? AND scope_id = ? FOR UPDATE', [id, scope, scopeId],
      );
      if (!rows[0]) throw new HttpError(404, 'Category not found');
      const [used] = await connection.execute<IdRow[]>(`
        SELECT id FROM categories WHERE parent_id = ?
        UNION ALL SELECT id FROM books WHERE platform_category_id = ? OR space_category_id = ?
        UNION ALL SELECT id FROM page_versions WHERE category_id = ? LIMIT 1
      `, [id, id, id, id]);
      if (used.length) throw new HttpError(409, 'Category has children or linked content');
      try {
        await connection.execute('DELETE FROM categories WHERE id = ?', [id]);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ER_ROW_IS_REFERENCED_2') {
          throw new HttpError(409, 'Category has children or linked content');
        }
        throw error;
      }
    });
  }

  async tags(spaceId: string) {
    const [rows] = await this.pool.execute<TagRow[]>('SELECT * FROM tags WHERE space_id = ? ORDER BY normalized_name, id', [spaceId]);
    return rows;
  }

  async createTag(spaceId: string, name: string, normalized: string) {
    const id = randomUUID();
    try {
      await this.pool.execute('INSERT INTO tags (id, space_id, name, normalized_name) VALUES (?, ?, ?, ?)', [id, spaceId, name, normalized]);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Tag already exists');
      throw error;
    }
    return { id, name };
  }

  async deleteTag(spaceId: string, id: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockSpace(connection, spaceId);
      const [rows] = await connection.execute<IdRow[]>('SELECT id FROM tags WHERE id = ? AND space_id = ? FOR UPDATE', [id, spaceId]);
      if (!rows[0]) throw new HttpError(404, 'Tag not found');
      const [used] = await connection.execute<IdRow[]>(`
        SELECT book_id AS id FROM book_tags WHERE tag_id = ?
        UNION ALL SELECT version_id AS id FROM page_version_tags WHERE tag_id = ? LIMIT 1
      `, [id, id]);
      if (used.length) throw new HttpError(409, 'Tag is linked to content or history');
      try {
        await connection.execute('DELETE FROM tags WHERE id = ?', [id]);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ER_ROW_IS_REFERENCED_2') {
          throw new HttpError(409, 'Tag is linked to content or history');
        }
        throw error;
      }
    });
  }

  private async validateCategory(connection: PoolConnection, id: string | null, scope: 'platform' | 'space' | 'book', scopeId: string | null) {
    if (!id) return;
    const [rows] = await connection.execute<IdRow[]>(
      'SELECT id FROM categories WHERE id = ? AND scope = ? AND scope_id <=> ? FOR UPDATE', [id, scope, scopeId],
    );
    if (!rows[0]) throw new HttpError(404, 'Category not found');
  }

  private async validateTags(connection: PoolConnection, tagIds: string[], spaceId: string) {
    for (const id of [...tagIds].sort()) {
      const [rows] = await connection.execute<IdRow[]>('SELECT id FROM tags WHERE id = ? AND space_id = ? FOR UPDATE', [id, spaceId]);
      if (!rows[0]) throw new HttpError(404, 'Tag not found');
    }
  }

  async bookClassification(bookId: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockBook(connection, bookId, spaceId);
      const [rows] = await connection.execute<Array<RowDataPacket & { platform_category_id: string | null; space_category_id: string | null }>>(
        'SELECT platform_category_id, space_category_id FROM books WHERE id = ?', [bookId],
      );
      const [tags] = await connection.execute<Array<RowDataPacket & { tag_id: string }>>('SELECT tag_id FROM book_tags WHERE book_id = ? ORDER BY tag_id', [bookId]);
      return { platformCategoryId: rows[0]!.platform_category_id, spaceCategoryId: rows[0]!.space_category_id, tagIds: tags.map((tag) => tag.tag_id) };
    });
  }

  async publicClassification(id: string, kind: 'book' | 'page') {
    return transaction(this.pool, async (connection) => {
      const [rows] = kind === 'book'
        ? await connection.execute<Array<RowDataPacket & { first_id: string | null; second_id: string | null; version_id: string | null }>>(`
          SELECT b.platform_category_id AS first_id, b.space_category_id AS second_id, NULL AS version_id
          FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
          WHERE b.id = ? AND b.deleted_at IS NULL AND u.status = 'active'
        `, [id])
        : await connection.execute<Array<RowDataPacket & { first_id: string | null; second_id: string | null; version_id: string | null }>>(`
          SELECT v.category_id AS first_id, NULL AS second_id, v.id AS version_id
          FROM pages p JOIN page_versions v ON v.id = p.published_version_id AND v.page_id = p.id
          JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
          WHERE p.id = ? AND p.deleted_at IS NULL AND b.deleted_at IS NULL AND u.status = 'active'
        `, [id]);
      if (!rows[0]) throw new HttpError(404, kind === 'book' ? 'Book not found' : 'Page not found');
      const [categories] = await connection.execute<CategoryRow[]>('SELECT * FROM categories WHERE id IN (?, ?) ORDER BY scope, name',
        [rows[0].first_id, rows[0].second_id]);
      const [tags] = kind === 'book'
        ? await connection.execute<TagRow[]>('SELECT t.* FROM tags t JOIN book_tags bt ON bt.tag_id = t.id WHERE bt.book_id = ? ORDER BY t.normalized_name', [id])
        : await connection.execute<TagRow[]>('SELECT t.* FROM tags t JOIN page_version_tags vt ON vt.tag_id = t.id WHERE vt.version_id = ? ORDER BY t.normalized_name', [rows[0].version_id]);
      return { categories, tags };
    });
  }

  async setBookClassification(bookId: string, spaceId: string, input: BookClassificationInput) {
    return transaction(this.pool, async (connection) => {
      await this.lockSpace(connection, spaceId);
      await this.lockBook(connection, bookId, spaceId);
      await this.validateCategory(connection, input.platformCategoryId, 'platform', null);
      await this.validateCategory(connection, input.spaceCategoryId, 'space', spaceId);
      await this.validateTags(connection, input.tagIds, spaceId);
      await connection.execute('UPDATE books SET platform_category_id = ?, space_category_id = ? WHERE id = ?',
        [input.platformCategoryId, input.spaceCategoryId, bookId]);
      await connection.execute('DELETE FROM book_tags WHERE book_id = ?', [bookId]);
      for (const tagId of input.tagIds) await connection.execute('INSERT INTO book_tags (book_id, tag_id) VALUES (?, ?)', [bookId, tagId]);
      return input;
    });
  }

  private async lockPage(connection: PoolConnection, pageId: string, spaceId: string) {
    const [pages] = await connection.execute<Array<RowDataPacket & { book_id: string }>>(`
      SELECT p.book_id FROM pages p JOIN books b ON b.id = p.book_id
      WHERE p.id = ? AND p.deleted_at IS NULL AND b.space_id = ? AND b.deleted_at IS NULL
    `, [pageId, spaceId]);
    if (!pages[0]) throw new HttpError(404, 'Page not found');
    await this.lockBook(connection, pages[0].book_id, spaceId);
    const [rows] = await connection.execute<Array<RowDataPacket & { id: string; book_id: string; title: string; body: string; revision: number }>>(
      'SELECT id, book_id, title, body, revision FROM pages WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [pageId],
    );
    if (!rows[0]) throw new HttpError(404, 'Page not found');
    return rows[0];
  }

  async pageClassification(pageId: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, pageId, spaceId);
      const [versions] = await connection.execute<Array<RowDataPacket & { id: string; category_id: string | null }>>(
        'SELECT id, category_id FROM page_versions WHERE page_id = ? AND revision = ? FOR UPDATE', [pageId, page.revision],
      );
      if (!versions[0]) throw new Error('Current page version is missing');
      const [tags] = await connection.execute<Array<RowDataPacket & { tag_id: string }>>(
        'SELECT tag_id FROM page_version_tags WHERE version_id = ? ORDER BY tag_id', [versions[0].id],
      );
      return { revision: page.revision, categoryId: versions[0].category_id, tagIds: tags.map((tag) => tag.tag_id) };
    });
  }

  async setPageClassification(pageId: string, spaceId: string, authorId: string, expected: number, categoryId: string | null, tagIds: string[]) {
    return transaction(this.pool, async (connection) => {
      await this.lockSpace(connection, spaceId);
      const page = await this.lockPage(connection, pageId, spaceId);
      if (page.revision !== expected) throw new HttpError(409, 'Page revision conflict');
      await this.validateCategory(connection, categoryId, 'book', page.book_id);
      await this.validateTags(connection, tagIds, spaceId);
      const id = randomUUID();
      const revision = page.revision + 1;
      await connection.execute('UPDATE pages SET revision = ? WHERE id = ?', [revision, pageId]);
      await connection.execute(
        'INSERT INTO page_versions (id, page_id, revision, title, body, author_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, pageId, revision, page.title, page.body, authorId, categoryId],
      );
      for (const tagId of tagIds) await connection.execute('INSERT INTO page_version_tags (version_id, tag_id) VALUES (?, ?)', [id, tagId]);
      return { revision, categoryId, tagIds };
    });
  }
}
