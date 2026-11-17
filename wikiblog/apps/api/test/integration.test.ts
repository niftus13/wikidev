import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions } from '../src/config.ts';

test('registration, sessions, CSRF, ownership and logout', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emailA = `a-${suffix}@example.test`;
  const emailB = `b-${suffix}@example.test`;
  const emailC = `c-${suffix}@example.test`;
  const handleA = `a-${suffix}`;
  const handleB = `b-${suffix}`;
  const password = 'integration-password-123';
  const origin = process.env.APP_ORIGIN!;

  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, csrf?: string, requestOrigin = origin) {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      headers.origin = requestOrigin;
    }
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    return fetch(`http://127.0.0.1:4000/api/v1${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function getCookie(response: Response) {
    const value = response.headers.get('set-cookie');
    assert.ok(value?.includes('HttpOnly'));
    assert.ok(value.includes('SameSite=Lax'));
    return value.split(';')[0]!;
  }

  try {
    const a = await request('/auth/register', 'POST', { email: emailA, handle: handleA, password });
    assert.equal(a.status, 201);
    const cookieA = getCookie(a);
    const dataA = await a.json() as { user: { id: string }; csrfToken: string };
    const b = await request('/auth/register', 'POST', { email: emailB, handle: handleB, password });
    assert.equal(b.status, 201);
    const cookieB = getCookie(b);
    const dataB = await b.json() as { csrfToken: string };

    const duplicate = await request('/auth/register', 'POST', { email: emailC, handle: handleA, password });
    assert.equal(duplicate.status, 409);
    const [orphan] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [emailC]);
    assert.equal(orphan.length, 0);
    const [stored] = await pool.execute<RowDataPacket[]>('SELECT password_hash FROM users WHERE id = ?', [dataA.user.id]);
    assert.ok(stored[0]?.password_hash.startsWith('scrypt$'));
    assert.notEqual(stored[0]?.password_hash, password);

    assert.equal((await request('/auth/session')).status, 401);
    assert.equal((await request('/auth/session', 'GET', undefined, cookieA)).status, 200);
    assert.equal((await request(`/spaces/${handleA}`)).status, 200);
    assert.equal((await request(`/spaces/${handleA}`, 'PATCH', { description: 'blocked' }, cookieB, dataB.csrfToken)).status, 404);
    assert.equal((await request(`/spaces/${handleA}`, 'PATCH', { description: 'blocked' }, cookieA)).status, 403);
    assert.equal((await request(`/spaces/${handleA}`, 'PATCH', { description: 'blocked' }, cookieA, dataA.csrfToken, 'https://evil.example')).status, 403);
    assert.equal((await request(`/spaces/${handleA}`, 'PATCH', { description: 'hello' }, cookieA, dataA.csrfToken)).status, 200);
    const space = await (await request(`/spaces/${handleA}`)).json() as { description: string };
    assert.equal(space.description, 'hello');

    assert.equal((await request('/auth/login', 'POST', { email: emailA, password: 'wrong-password-123' })).status, 401);
    const login = await request('/auth/login', 'POST', { email: emailA, password });
    assert.equal(login.status, 200);
    const cookieLogin = getCookie(login);
    const loginData = await login.json() as { csrfToken: string };
    assert.equal((await request('/auth/logout', 'POST', {}, cookieLogin, loginData.csrfToken)).status, 204);
    assert.equal((await request('/auth/session', 'GET', undefined, cookieLogin)).status, 401);
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email IN (?, ?, ?)', [emailA, emailB, emailC]);
    for (const user of users) {
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});
