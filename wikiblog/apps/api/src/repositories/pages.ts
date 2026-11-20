import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { PageEntity, PageVersionEntity } from '@wikiblog/entities';
import { HttpError } from '../services/errors.ts';
import { transaction } from './transaction.ts';

type PageRow = RowDataPacket & Pick<PageEntity, 'id' | 'book_id' | 'title' | 'body' | 'revision'>;
type VersionRow = RowDataPacket & PageVersionEntity;
type BookRow = RowDataPacket & { id: string; toc_revision: number };
type TocRow = RowDataPacket & Pick<PageEntity, 'id' | 'parent_id' | 'sort_order' | 'published_version_id'> & { title: string };
type PublishedRow = RowDataPacket & Pick<PageEntity, 'id' | 'book_id'> & Pick<PageVersionEntity, 'title' | 'body' | 'revision'>;
type Content = { title: string; body: string };

export class PageRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async lockBook(connection: PoolConnection, bookId: string, spaceId: string, missing = 'Book not found') {
    const [rows] = await connection.execute<BookRow[]>(
      'SELECT id, toc_revision FROM books WHERE id = ? AND space_id = ? AND deleted_at IS NULL FOR UPDATE', [bookId, spaceId],
    );
    if (!rows[0]) throw new HttpError(404, missing);
    return rows[0];
  }

  private async lockPage(connection: PoolConnection, id: string, spaceId: string) {
    const [books] = await connection.execute<Array<RowDataPacket & { id: string }>>(`
      SELECT b.id FROM books b JOIN pages p ON p.book_id = b.id
      WHERE p.id = ? AND b.space_id = ? AND b.deleted_at IS NULL AND p.deleted_at IS NULL
    `, [id, spaceId]);
    if (!books[0]) throw new HttpError(404, 'Page not found');
    await this.lockBook(connection, books[0].id, spaceId, 'Page not found');
    const [rows] = await connection.execute<PageRow[]>(
      'SELECT id, book_id, title, body, revision FROM pages WHERE id = ? AND book_id = ? AND deleted_at IS NULL FOR UPDATE', [id, books[0].id],
    );
    if (!rows[0]) throw new HttpError(404, 'Page not found');
    return rows[0];
  }

  private async version(connection: PoolConnection, pageId: string, revision: number, content: Content, authorId: string, sourceRevision?: number) {
    const id = randomUUID();
    let categoryId: string | null = null;
    let tagIds: string[] = [];
    if (sourceRevision) {
      const [source] = await connection.execute<Array<RowDataPacket & { id: string; category_id: string | null }>>(
        'SELECT id, category_id FROM page_versions WHERE page_id = ? AND revision = ? FOR UPDATE', [pageId, sourceRevision],
      );
      if (!source[0]) throw new Error('Source page version is missing');
      categoryId = source[0].category_id;
      const [tags] = await connection.execute<Array<RowDataPacket & { tag_id: string }>>(
        'SELECT tag_id FROM page_version_tags WHERE version_id = ? FOR UPDATE', [source[0].id],
      );
      tagIds = tags.map((tag) => tag.tag_id);
    }
    await connection.execute(
      'INSERT INTO page_versions (id, page_id, revision, title, body, author_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, pageId, revision, content.title, content.body, authorId, categoryId],
    );
    for (const tagId of tagIds) await connection.execute('INSERT INTO page_version_tags (version_id, tag_id) VALUES (?, ?)', [id, tagId]);
  }

  private async tree(connection: PoolConnection, bookId: string) {
    const [rows] = await connection.execute<TocRow[]>(`
      SELECT id, parent_id, sort_order, published_version_id, title FROM pages
      WHERE book_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at, id FOR UPDATE
    `, [bookId]);
    return rows;
  }

  private async incrementToc(connection: PoolConnection, bookId: string) {
    await connection.execute('UPDATE books SET toc_revision = toc_revision + 1 WHERE id = ?', [bookId]);
  }

  async list(bookId: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockBook(connection, bookId, spaceId);
      const [rows] = await connection.execute<PageRow[]>(
        'SELECT id, book_id, title, body, revision FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY created_at, id', [bookId],
      );
      return rows;
    });
  }

  async get(id: string, spaceId: string) {
    const [rows] = await this.pool.execute<PageRow[]>(`
      SELECT p.id, p.book_id, p.title, p.body, p.revision FROM pages p
      JOIN books b ON b.id = p.book_id
      WHERE p.id = ? AND b.space_id = ? AND b.deleted_at IS NULL AND p.deleted_at IS NULL
    `, [id, spaceId]);
    if (!rows[0]) throw new HttpError(404, 'Page not found');
    return rows[0];
  }

  async create(bookId: string, spaceId: string, authorId: string, content: Content) {
    return transaction(this.pool, async (connection) => {
      await this.lockBook(connection, bookId, spaceId);
      const id = randomUUID();
      await connection.execute(`INSERT INTO pages (id, book_id, title, body, revision, sort_order)
        SELECT ?, ?, ?, ?, 1, COALESCE(MAX(sort_order) + 1, 0) FROM pages
        WHERE book_id = ? AND parent_id IS NULL AND deleted_at IS NULL`,
      [id, bookId, content.title, content.body, bookId]);
      await this.version(connection, id, 1, content, authorId);
      await this.incrementToc(connection, bookId);
      return { id, book_id: bookId, ...content, revision: 1 };
    });
  }

  async update(id: string, spaceId: string, authorId: string, expected: number, content: Content) {
    return transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, id, spaceId);
      if (page.revision !== expected) throw new HttpError(409, 'Page revision conflict');
      const revision = page.revision + 1;
      await connection.execute('UPDATE pages SET title = ?, body = ?, revision = ? WHERE id = ?',
        [content.title, content.body, revision, id]);
      await this.version(connection, id, revision, content, authorId, page.revision);
      return { ...page, ...content, revision };
    });
  }

  async versions(id: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      await this.lockPage(connection, id, spaceId);
      const [rows] = await connection.execute<VersionRow[]>(
        'SELECT id, page_id, revision, title, body, author_id, created_at FROM page_versions WHERE page_id = ? ORDER BY revision DESC FOR UPDATE', [id],
      );
      return rows;
    });
  }

  async restore(id: string, spaceId: string, authorId: string, expected: number, versionId: string) {
    return transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, id, spaceId);
      if (page.revision !== expected) throw new HttpError(409, 'Page revision conflict');
      const [rows] = await connection.execute<VersionRow[]>(
        'SELECT id, page_id, revision, title, body, author_id, created_at FROM page_versions WHERE id = ? AND page_id = ? FOR UPDATE', [versionId, id],
      );
      const previous = rows[0];
      if (!previous) throw new HttpError(404, 'Version not found');
      const revision = page.revision + 1;
      await connection.execute('UPDATE pages SET title = ?, body = ?, revision = ? WHERE id = ?',
        [previous.title, previous.body, revision, id]);
      await this.version(connection, id, revision, previous, authorId, previous.revision);
      return { ...page, title: previous.title, body: previous.body, revision };
    });
  }

  async delete(id: string, spaceId: string) {
    await transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, id, spaceId);
      const rows = await this.tree(connection, page.book_id);
      const pending = [id];
      while (pending.length) {
        const current = pending.pop()!;
        pending.push(...rows.filter((row) => row.parent_id === current).map((row) => row.id));
        await connection.execute('UPDATE pages SET deleted_at = UTC_TIMESTAMP() WHERE id = ?', [current]);
      }
      await this.incrementToc(connection, page.book_id);
    });
  }

  async publish(id: string, spaceId: string, expected: number) {
    return transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, id, spaceId);
      if (page.revision !== expected) throw new HttpError(409, 'Page revision conflict');
      const rows = await this.tree(connection, page.book_id);
      const nodes = new Map(rows.map((row) => [row.id, row]));
      let parentId = nodes.get(id)?.parent_id;
      while (parentId) {
        const parent = nodes.get(parentId);
        if (!parent || !parent.published_version_id) throw new HttpError(409, 'All parent pages must be published');
        parentId = parent.parent_id;
      }
      const [versions] = await connection.execute<VersionRow[]>(
        'SELECT id, page_id, revision, title, body, author_id, created_at FROM page_versions WHERE page_id = ? AND revision = ? FOR UPDATE',
        [id, expected],
      );
      if (!versions[0]) throw new Error('Current page version is missing');
      await connection.execute('UPDATE pages SET published_version_id = ? WHERE id = ?', [versions[0].id, id]);
      return { id, book_id: page.book_id, title: versions[0].title, body: versions[0].body, revision: versions[0].revision };
    });
  }

  /** 페이지와 모든 자손 중 발행된 페이지를 같은 트랜잭션에서 발행 취소하고, 취소한 ID를 요청 페이지부터 얕은 깊이 순으로 반환한다. */
  async unpublish(id: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      const page = await this.lockPage(connection, id, spaceId);
      const rows = await this.tree(connection, page.book_id);
      const unpublished: string[] = [];
      const pending = [id];
      while (pending.length) {
        const current = pending.shift()!;
        const node = rows.find((row) => row.id === current);
        if (node?.published_version_id) unpublished.push(current);
        pending.push(...rows.filter((row) => row.parent_id === current).map((row) => row.id));
      }
      for (const pageId of unpublished) {
        await connection.execute('UPDATE pages SET published_version_id = NULL WHERE id = ?', [pageId]);
      }
      return unpublished;
    });
  }

  async published(id: string) {
    const [rows] = await this.pool.execute<PublishedRow[]>(`
      SELECT p.id, p.book_id, v.title, v.body, v.revision FROM pages p
      JOIN page_versions v ON v.id = p.published_version_id AND v.page_id = p.id
      JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE p.id = ? AND p.deleted_at IS NULL AND b.deleted_at IS NULL AND u.status = 'active'
    `, [id]);
    if (!rows[0]) throw new HttpError(404, 'Page not found');
    return rows[0];
  }

  async ownedToc(bookId: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      const book = await this.lockBook(connection, bookId, spaceId);
      return { revision: book.toc_revision, rows: await this.tree(connection, bookId) };
    });
  }

  async publicToc(bookId: string) {
    return transaction(this.pool, async (connection) => {
      const [books] = await connection.execute<Array<RowDataPacket & { id: string }>>(`
        SELECT b.id FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
        WHERE b.id = ? AND b.deleted_at IS NULL AND u.status = 'active'
      `, [bookId]);
      if (!books[0]) throw new HttpError(404, 'Book not found');
      const [rows] = await connection.execute<TocRow[]>(`
        SELECT p.id, p.parent_id, p.sort_order, p.published_version_id, v.title
        FROM pages p JOIN page_versions v ON v.id = p.published_version_id AND v.page_id = p.id
        WHERE p.book_id = ? AND p.deleted_at IS NULL ORDER BY p.sort_order, p.created_at, p.id
      `, [bookId]);
      return rows;
    });
  }

  async move(bookId: string, spaceId: string, expected: number, pageId: string, parentId: string | null, position: number) {
    return transaction(this.pool, async (connection) => {
      const book = await this.lockBook(connection, bookId, spaceId);
      if (book.toc_revision !== expected) throw new HttpError(409, 'Table of contents revision conflict');
      const rows = await this.tree(connection, bookId);
      const nodes = new Map(rows.map((row) => [row.id, row]));
      const page = nodes.get(pageId);
      if (!page || (parentId !== null && !nodes.has(parentId))) throw new HttpError(404, 'Page not found');
      let ancestor = parentId;
      while (ancestor) {
        if (ancestor === pageId) throw new HttpError(400, 'Page hierarchy cannot contain a cycle');
        const parent = nodes.get(ancestor);
        if (!parent) throw new Error('Page hierarchy is invalid');
        if (page.published_version_id && !parent.published_version_id) {
          throw new HttpError(409, 'All parent pages must be published');
        }
        ancestor = parent.parent_id;
      }
      const siblings = rows.filter((row) => row.parent_id === parentId && row.id !== pageId);
      if (position > siblings.length) throw new HttpError(400, 'Invalid page position');
      siblings.splice(position, 0, page);
      for (const [index, sibling] of siblings.entries()) {
        await connection.execute('UPDATE pages SET parent_id = ?, sort_order = ? WHERE id = ?', [parentId, index, sibling.id]);
      }
      await this.incrementToc(connection, bookId);
      return { revision: book.toc_revision + 1, rows: await this.tree(connection, bookId) };
    });
  }
}
