import { isIP } from 'node:net';
import mysql from 'mysql2/promise';

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function databaseOptions() {
  return {
    host: required('MYSQL_HOST'),
    database: required('MYSQL_DATABASE'),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    timezone: 'Z',
  };
}

export function createPool() {
  return mysql.createPool({ ...databaseOptions(), waitForConnections: true, connectionLimit: 10 });
}

export function securityConfig() {
  const rawOrigin = required('APP_ORIGIN');
  const origin = new URL(rawOrigin);
  if (origin.origin !== rawOrigin || !['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path');
  }
  const secure = required('COOKIE_SECURE');
  if (secure !== 'true' && secure !== 'false') throw new Error('COOKIE_SECURE must be true or false');
  if (secure === 'false' && (origin.protocol !== 'http:' || origin.hostname !== 'localhost')) {
    throw new Error('Insecure cookies are allowed only for HTTP localhost development');
  }
  if (secure === 'true' && origin.protocol !== 'https:') {
    throw new Error('Secure cookies require an HTTPS APP_ORIGIN');
  }
  return { origin: origin.origin, secureCookie: secure === 'true', trustProxy: parseTrustProxy(process.env.TRUST_PROXY) };
}

const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

// TRUST_PROXY는 Express `trust proxy`에 넘길 신뢰 프록시 목록이다. 모든 주소를 믿는 값(true, hop 수, *, /0)은 거부한다.
export function parseTrustProxy(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const entries = raw.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (!validTrustProxyEntry(entry)) {
      throw new Error('TRUST_PROXY must be a comma-separated list of IP addresses, CIDR ranges, loopback, linklocal or uniquelocal');
    }
  }
  return entries;
}

function validTrustProxyEntry(entry: string): boolean {
  if (TRUST_PROXY_NAMES.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !address) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^[0-9]{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 1 && bits <= (version === 4 ? 32 : 128);
}
