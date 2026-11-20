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

test('space book list returns only that space\'s live books newest first and 404s for missing or disabled spaces', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emails = [`space-books-a-${suffix}@example.test`, `space-books-b-${suffix}@example.test`];
  const handles = [`sa-${suffix}`, `sb-${suffix}`];
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
  async function createBook(user: { cookie: string; csrf: string }, slug: string) {
    const response = await request('/me/books', 'POST', { slug, title: `Title ${slug}`, description: '' }, user.cookie, user.csrf);
    assert.equal(response.status, 201);
    return (await response.json() as { id: string }).id;
  }
  type Listed = { id: string; spaceId: string; slug: string; title: string; description: string; handle: string };
  async function spaceBooks(handle: string) {
    const response = await request(`/spaces/${handle}/books`);
    assert.equal(response.status, 200);
    return await response.json() as Listed[];
  }
  try {
    const a = await register(emails[0]!, handles[0]!);
    const b = await register(emails[1]!, handles[1]!);
    // A space with no books is 200 [] (not 404).
    assert.deepEqual(await spaceBooks(handles[1]!), []);

    const oldest = await createBook(a, `old-${suffix}`);
    const middle = await createBook(a, `mid-${suffix}`);
    const newest = await createBook(a, `new-${suffix}`);
    const foreign = await createBook(b, `other-${suffix}`);
    // created_at has second precision; pin distinct values so the order assertion is deterministic.
    for (const [id, at] of [[oldest, '2020-01-01 00:00:01'], [middle, '2020-01-01 00:00:02'], [newest, '2020-01-01 00:00:03']]) {
      await pool.execute('UPDATE books SET created_at = ? WHERE id = ?', [at, id]);
    }
    assert.equal((await request(`/books/${middle}`, 'DELETE', {}, a.cookie, a.csrf)).status, 204);

    const listed = await spaceBooks(handles[0]!);
    assert.deepEqual(listed.map((book) => book.id), [newest, oldest]);
    assert.equal(listed.some((book) => book.id === foreign || book.id === middle), false);
    assert.deepEqual(Object.keys(listed[0]!).sort(), ['description', 'handle', 'id', 'slug', 'spaceId', 'title']);
    assert.equal(listed[0]!.handle, handles[0]);
    // Same order and shape as the global public list filtered to this space.
    const global = await (await request('/books')).json() as Listed[];
    assert.deepEqual(global.filter((book) => book.handle === handles[0]), listed);
    assert.deepEqual((await spaceBooks(handles[1]!)).map((book) => book.id), [foreign]);

    // Handles are normalized like the space API.
    assert.deepEqual(await spaceBooks(handles[0]!.toUpperCase()), listed);
    assert.deepEqual(await spaceBooks(encodeURIComponent(` ${handles[0]!} `)), listed);

    assert.equal((await request(`/spaces/missing-${suffix}/books`)).status, 404);
    assert.equal((await request('/spaces/ab/books')).status, 404);
    assert.equal((await request(`/spaces/${encodeURIComponent('bad handle!')}/books`)).status, 404);

    await pool.execute("UPDATE users SET status = 'disabled' WHERE email = ?", [emails[0]]);
    assert.equal((await request(`/spaces/${handles[0]}/books`)).status, 404);
    const afterDisable = await (await request('/books')).json() as Listed[];
    assert.equal(afterDisable.some((book) => book.handle === handles[0]), false);
    await pool.execute("UPDATE users SET status = 'active' WHERE email = ?", [emails[0]]);
    assert.deepEqual((await spaceBooks(handles[0]!)).map((book) => book.id), [newest, oldest]);

    // Existing slug detail route is unaffected by the new list route.
    assert.equal((await request(`/spaces/${handles[0]}/books/new-${suffix}`)).status, 200);
    assert.equal((await request(`/spaces/${handles[0]}/books/mid-${suffix}`)).status, 404);
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
