import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { BookEntity } from '@wikiblog/entities';
import { transaction } from './transaction.ts';

type BookRow = RowDataPacket & Pick<BookEntity, 'id' | 'space_id' | 'slug' | 'title' | 'description'>;
type PublicBookRow = BookRow & { handle: string };
type BookValues = Pick<BookEntity, 'slug' | 'title' | 'description'>;

export class BookRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async list() {
    const [rows] = await this.pool.query<PublicBookRow[]>(`
      SELECT b.id, b.space_id, b.slug, b.title, b.description, s.handle
      FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE b.deleted_at IS NULL AND u.status = 'active' ORDER BY b.created_at DESC, b.id DESC
    `);
    return rows;
  }

  async listOwned(spaceId: string) {
    const [rows] = await this.pool.execute<BookRow[]>(
      'SELECT id, space_id, slug, title, description FROM books WHERE space_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC',
      [spaceId],
    );
    return rows;
  }

  async find(id: string) {
    const [rows] = await this.pool.execute<PublicBookRow[]>(`
      SELECT b.id, b.space_id, b.slug, b.title, b.description, s.handle
      FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE b.id = ? AND b.deleted_at IS NULL AND u.status = 'active'
    `, [id]);
    return rows[0];
  }

  async findBySlug(handle: string, slug: string) {
    const [rows] = await this.pool.execute<PublicBookRow[]>(`
      SELECT b.id, b.space_id, b.slug, b.title, b.description, s.handle
      FROM books b JOIN spaces s ON s.id = b.space_id JOIN users u ON u.id = s.owner_id
      WHERE s.handle = ? AND b.slug = ? AND b.deleted_at IS NULL AND u.status = 'active'
    `, [handle, slug]);
    return rows[0];
  }

  async create(spaceId: string, values: BookValues) {
    const id = randomUUID();
    await this.pool.execute('INSERT INTO books (id, space_id, slug, title, description) VALUES (?, ?, ?, ?, ?)',
      [id, spaceId, values.slug, values.title, values.description]);
    return { id, space_id: spaceId, ...values };
  }

  async update(id: string, spaceId: string, values: BookValues) {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE books SET slug = ?, title = ?, description = ? WHERE id = ? AND space_id = ? AND deleted_at IS NULL',
      [values.slug, values.title, values.description, id, spaceId],
    );
    return result.affectedRows > 0;
  }

  async delete(id: string, spaceId: string) {
    return transaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE books SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND space_id = ? AND deleted_at IS NULL',
        [id, spaceId],
      );
      if (result.affectedRows) {
        await connection.execute('UPDATE pages SET deleted_at = UTC_TIMESTAMP() WHERE book_id = ? AND deleted_at IS NULL', [id]);
      }
      return result.affectedRows > 0;
    });
  }
}
