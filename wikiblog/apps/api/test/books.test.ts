import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions } from '../src/config.ts';

test('books are public, scoped to their owner, unique and excluded after deletion', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emails = [`book-a-${suffix}@example.test`, `book-b-${suffix}@example.test`];
  const origin = process.env.APP_ORIGIN!;
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, csrf?: string) {
    const headers: Record<string, string> = {};
    if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json'; }
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    return fetch(`http://127.0.0.1:4000/api/v1${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function register(email: string, handle: string) {
    const response = await request('/auth/register', 'POST', { email, handle, password: 'integration-password-123' });
    assert.equal(response.status, 201);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const result = await response.json() as { csrfToken: string };
    return { cookie, csrf: result.csrfToken };
  }
  try {
    const a = await register(emails[0]!, `a-${suffix}`);
    const b = await register(emails[1]!, `b-${suffix}`);
    const input = { slug: `book-${suffix}`, title: 'Book', description: 'Intro' };
    const created = await request('/me/books', 'POST', input, a.cookie, a.csrf);
    assert.equal(created.status, 201);
    const book = await created.json() as { id: string };
    assert.equal((await request(`/books/${book.id}`)).status, 200);
    assert.equal((await request('/me/books', 'POST', input, a.cookie, a.csrf)).status, 409);
    assert.equal((await request(`/books/${book.id}`, 'PATCH', input, b.cookie, b.csrf)).status, 404);
    assert.equal((await request(`/books/${book.id}`, 'DELETE', {}, a.cookie)).status, 403);
    assert.equal((await request(`/books/${book.id}`, 'PATCH', { ...input, title: 'Updated' }, a.cookie, a.csrf)).status, 200);
    assert.equal((await request(`/books/${book.id}`, 'DELETE', {}, a.cookie, a.csrf)).status, 204);
    assert.equal((await request(`/books/${book.id}`)).status, 404);
    const list = await (await request('/books')).json() as Array<{ id: string }>;
    assert.equal(list.some((entry) => entry.id === book.id), false);
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email IN (?, ?)', emails);
    for (const user of users) {
      await pool.execute('DELETE b FROM books b JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});
