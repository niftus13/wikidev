import type { LoginResponse, SessionResponse, SpaceDto } from '@wikiblog/dto';
import { normalizeEmail, normalizeHandle } from '@wikiblog/shared';
import { equalToken, hashPassword, validPassword, verifyPassword } from '../security.ts';
import { AuthRepository } from '../repositories/auth.ts';
import type { SessionRow } from '../repositories/auth.ts';
import { HttpError } from './errors.ts';

const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export type RedisClient = {
  ping: () => Promise<unknown>;
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
};

export class AuthService {
  readonly repository: AuthRepository;
  readonly redis: RedisClient;
  constructor(repository: AuthRepository, redis: RedisClient) {
    this.repository = repository;
    this.redis = redis;
  }

  async session(raw: string | null): Promise<SessionRow> {
    if (!raw) throw new HttpError(401, 'Authentication required');
    const current = await this.repository.session(raw);
    if (!current) throw new HttpError(401, 'Authentication required');
    return current;
  }

  checkCsrf(value: string, current: SessionRow) {
    if (!equalToken(value, current.csrf_token)) throw new HttpError(403, 'Invalid CSRF token');
  }

  async limit(ip: string | undefined, action: string) {
    if (!ip) throw new Error('Client IP unavailable');
    const count = await this.redis.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 900) end; return n",
      { keys: [`auth-rate:${action}:${ip}`], arguments: [] },
    );
    if (typeof count !== 'number') throw new Error('Invalid rate limit response');
    if (count > 20) throw new HttpError(429, 'Too many requests');
  }

  async register(body: { email?: unknown; handle?: unknown; password?: unknown }, old: string | null) {
    const email = normalizeEmail(body.email);
    const handle = normalizeHandle(body.handle);
    const password = body.password;
    if (!email || !handle || !validPassword(password)) throw new HttpError(400, 'Invalid email, handle, or password');
    try {
      const created = await this.repository.register(email, await hashPassword(password), handle, old);
      const response: SessionResponse = {
        user: { id: created.userId, email },
        space: { id: created.spaceId, handle, description: '' },
        csrfToken: created.csrfToken,
      };
      return { response, sessionToken: created.sessionToken };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, 'Email or handle is already in use');
      }
      throw error;
    }
  }

  async login(body: { email?: unknown; password?: unknown }, old: string | null) {
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!email || !validPassword(password)) throw new HttpError(400, 'Invalid email or password');
    const user = await this.repository.user(email);
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid || user.status !== 'active') throw new HttpError(401, 'Invalid email or password');
    const created = await this.repository.login(user.id, old);
    const response: LoginResponse = { csrfToken: created.csrfToken };
    return { response, sessionToken: created.sessionToken };
  }

  describeSession(current: SessionRow): SessionResponse {
    return {
      user: { id: current.user_id, email: current.email },
      space: { id: current.space_id, handle: current.handle, description: current.description },
      csrfToken: current.csrf_token,
    };
  }

  async space(value: unknown): Promise<SpaceDto> {
    const handle = normalizeHandle(value);
    if (!handle) throw new HttpError(404, 'Space not found');
    const space = await this.repository.space(handle);
    if (!space) throw new HttpError(404, 'Space not found');
    return { id: space.id, handle: space.handle, description: space.description };
  }

  async updateSpace(current: SessionRow, value: unknown, description: unknown): Promise<SpaceDto> {
    const handle = normalizeHandle(value);
    if (!handle || handle !== current.handle) throw new HttpError(404, 'Space not found');
    if (typeof description !== 'string' || Array.from(description).length > 500) {
      throw new HttpError(400, 'Description must be a string of at most 500 characters');
    }
    await this.repository.updateSpace(current.space_id, current.user_id, description);
    return { id: current.space_id, handle, description };
  }
}
