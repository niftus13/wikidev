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
  return { origin: origin.origin, secureCookie: secure === 'true' };
}
