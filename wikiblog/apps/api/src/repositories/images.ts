import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { ImageEntity } from '@wikiblog/entities';
import { HttpError } from '../services/errors.ts';
import { transaction } from './transaction.ts';

type StoredImage = Pick<ImageEntity, 'id' | 'content_type' | 'byte_size'>;
type ImageRow = RowDataPacket & Pick<ImageEntity, 'content_type' | 'byte_size' | 'data'>;

export class ImageRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  /**
   * 공간 행을 잠근 뒤 총량을 확인하고 저장한다. 같은 공간의 업로드는 이 잠금으로 직렬화되므로
   * 동시 업로드가 함께 총량을 넘길 수 없다.
   */
  async create(spaceId: string, contentType: string, data: Buffer, sha256: string, quotaBytes: number): Promise<StoredImage> {
    return transaction(this.pool, async (connection) => {
      const [spaces] = await connection.execute<Array<RowDataPacket & { id: string }>>(
        'SELECT id FROM spaces WHERE id = ? FOR UPDATE', [spaceId],
      );
      if (!spaces[0]) throw new HttpError(404, 'Space not found');
      const [usage] = await connection.execute<Array<RowDataPacket & { used: string | number }>>(
        'SELECT COALESCE(SUM(byte_size), 0) AS used FROM images WHERE space_id = ?', [spaceId],
      );
      if (Number(usage[0]?.used ?? 0) + data.length > quotaBytes) throw new HttpError(409, 'Image storage quota exceeded');
      const id = randomUUID();
      await connection.execute(
        'INSERT INTO images (id, space_id, content_type, byte_size, sha256, data) VALUES (?, ?, ?, ?, ?, ?)',
        [id, spaceId, contentType, data.length, sha256, data],
      );
      return { id, content_type: contentType, byte_size: data.length };
    });
  }

  /** 소유자가 활성 상태인 공간의 이미지만 반환한다. */
  async find(id: string) {
    const [rows] = await this.pool.execute<ImageRow[]>(`
      SELECT i.content_type, i.byte_size, i.data FROM images i
      JOIN spaces s ON s.id = i.space_id JOIN users u ON u.id = s.owner_id
      WHERE i.id = ? AND u.status = 'active'
    `, [id]);
    if (!rows[0]) throw new HttpError(404, 'Image not found');
    return rows[0];
  }
}
