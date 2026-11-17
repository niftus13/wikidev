import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { SessionEntity, SpaceEntity, UserEntity } from '@wikiblog/entities';
import { hashToken, token } from '../security.ts';

export type UserRow = RowDataPacket & Pick<UserEntity, 'id' | 'password_hash' | 'status'>;
export type SessionRow = RowDataPacket & Pick<SessionEntity, 'user_id' | 'csrf_token'> &
  Pick<UserEntity, 'email'> & Pick<SpaceEntity, 'handle' | 'description'> & { space_id: SpaceEntity['id'] };
type SpaceRow = RowDataPacket & Pick<SpaceEntity, 'id' | 'handle' | 'description'>;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

async function createSession(connection: PoolConnection, userId: string) {
  const sessionToken = token();
  const csrfToken = token();
  await connection.execute(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
    [hashToken(sessionToken), userId, csrfToken, SESSION_SECONDS],
  );
  return { sessionToken, csrfToken };
}

export class AuthRepository {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async session(raw: string): Promise<SessionRow | undefined> {
    const [rows] = await this.pool.execute<SessionRow[]>(`
      SELECT u.id AS user_id, u.email, s.id AS space_id, s.handle, s.description, se.csrf_token
      FROM sessions se JOIN users u ON u.id = se.user_id JOIN spaces s ON s.owner_id = u.id
      WHERE se.token_hash = ? AND se.expires_at > UTC_TIMESTAMP() AND u.status = 'active'
    `, [hashToken(raw)]);
    return rows[0];
  }

  async user(email: string): Promise<UserRow | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>('SELECT id, password_hash, status FROM users WHERE email = ?', [email]);
    return rows[0];
  }

  async register(email: string, passwordHash: string, handle: string, old: string | null) {
    const userId = randomUUID();
    const spaceId = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [userId, email, passwordHash]);
      await connection.execute('INSERT INTO spaces (id, owner_id, handle) VALUES (?, ?, ?)', [spaceId, userId, handle]);
      const created = await createSession(connection, userId);
      if (old) await connection.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(old)]);
      await connection.commit();
      return { userId, spaceId, ...created };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async login(userId: string, old: string | null) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const created = await createSession(connection, userId);
      if (old) await connection.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(old)]);
      await connection.execute('DELETE FROM sessions WHERE user_id = ? AND expires_at <= UTC_TIMESTAMP()', [userId]);
      await connection.commit();
      return created;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async logout(raw: string) {
    await this.pool.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(raw)]);
  }

  async space(handle: string) {
    const [rows] = await this.pool.execute<SpaceRow[]>(
      "SELECT s.id, s.handle, s.description FROM spaces s JOIN users u ON u.id = s.owner_id WHERE s.handle = ? AND u.status = 'active'",
      [handle],
    );
    return rows[0];
  }

  async updateSpace(id: string, owner: string, description: string) {
    await this.pool.execute('UPDATE spaces SET description = ? WHERE id = ? AND owner_id = ?', [description, id, owner]);
  }
}
