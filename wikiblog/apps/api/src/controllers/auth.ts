import { isIPv4 } from 'node:net';
import type { Request, Response } from 'express';
import type { LoginRequest, RegisterRequest, UpdateSpaceRequest } from '@wikiblog/dto';
import { AuthService } from '../services/auth.ts';
import { HttpError } from '../services/errors.ts';

export type SecurityConfig = { origin: string; secureCookie: boolean; trustProxy?: string[] | undefined };
const COOKIE_NAME = 'wikiblog_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function sessionCookie(request: Request): string | null {
  const cookies = (request.get('cookie') ?? '').split(';').map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

// 같은 IPv4 클라이언트가 IPv4-mapped IPv6 형식(::ffff:a.b.c.d)과 IPv4 형식으로 나뉘어 집계되지 않게 한다.
export function clientAddress(ip: string | undefined): string | undefined {
  if (ip?.toLowerCase().startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (isIPv4(mapped)) return mapped;
  }
  return ip;
}

export class AuthController {
  readonly service: AuthService;
  readonly config: SecurityConfig;
  constructor(service: AuthService, config: SecurityConfig) {
    this.service = service;
    this.config = config;
  }
  cookieOptions() { return { httpOnly: true, secure: this.config.secureCookie, sameSite: 'lax' as const, path: '/' }; }
  async session(request: Request) { return this.service.session(sessionCookie(request)); }
  async mutationSession(request: Request) {
    const current = await this.session(request);
    this.service.checkCsrf(request.get('x-csrf-token') ?? '', current);
    return current;
  }
  register = async (request: Request, response: Response) => {
    await this.service.limit(clientAddress(request.ip), 'register');
    const body: Partial<Record<keyof RegisterRequest, unknown>> = request.body ?? {};
    const result = await this.service.register(body, sessionCookie(request));
    response.cookie(COOKIE_NAME, result.sessionToken, { ...this.cookieOptions(), maxAge: SESSION_SECONDS * 1000 });
    response.status(201).json(result.response);
  };
  login = async (request: Request, response: Response) => {
    await this.service.limit(clientAddress(request.ip), 'login');
    const body: Partial<Record<keyof LoginRequest, unknown>> = request.body ?? {};
    const result = await this.service.login(body, sessionCookie(request));
    response.cookie(COOKIE_NAME, result.sessionToken, { ...this.cookieOptions(), maxAge: SESSION_SECONDS * 1000 });
    response.json(result.response);
  };
  getSession = async (request: Request, response: Response) => {
    response.json(this.service.describeSession(await this.session(request)));
  };
  logout = async (request: Request, response: Response) => {
    await this.mutationSession(request);
    const raw = sessionCookie(request);
    if (!raw) throw new HttpError(401, 'Authentication required');
    await this.service.repository.logout(raw);
    response.clearCookie(COOKIE_NAME, this.cookieOptions());
    response.status(204).end();
  };
  getSpace = async (request: Request, response: Response) => {
    response.json(await this.service.space(request.params.handle));
  };
  updateSpace = async (request: Request, response: Response) => {
    const current = await this.mutationSession(request);
    const body: Partial<Record<keyof UpdateSpaceRequest, unknown>> = request.body ?? {};
    response.json(await this.service.updateSpace(current, request.params.handle, body.description));
  };
}
