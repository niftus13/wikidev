import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions } from '../src/config.ts';

test('draft history, ownership, revision conflicts, restore and book deletion', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emails = [`page-a-${suffix}@example.test`, `page-b-${suffix}@example.test`];
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
    const res = await request('/auth/register', 'POST', { email, handle, password: 'integration-password-123' });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const result = await res.json() as { csrfToken: string };
    return { cookie, csrf: result.csrfToken };
  }
  try {
    const a = await register(emails[0]!, `a-${suffix}`);
    const b = await register(emails[1]!, `b-${suffix}`);
    const bookResponse = await request('/me/books', 'POST', { slug: `book-${suffix}`, title: 'Book', description: '' }, a.cookie, a.csrf);
    assert.equal(bookResponse.status, 201);
    const book = await bookResponse.json() as { id: string };
    const create = await request(`/books/${book.id}/pages`, 'POST', { title: 'Initial', body: 'draft only' }, a.cookie, a.csrf);
    assert.equal(create.status, 201);
    const page = await create.json() as { id: string; revision: number };
    assert.equal(page.revision, 1);
    assert.equal((await request(`/pages/${page.id}`)).status, 404);
    assert.equal((await request(`/me/pages/${page.id}`)).status, 401);
    assert.equal((await request(`/me/pages/${page.id}`, 'GET', undefined, b.cookie)).status, 404);
    assert.equal((await request(`/pages/${page.id}/versions`, 'GET', undefined, b.cookie)).status, 404);
    assert.equal((await request(`/books/${book.id}/pages`, 'POST', { title: 'x', body: '' }, b.cookie, b.csrf)).status, 404);
    assert.equal((await request(`/pages/${page.id}`, 'PATCH', { title: 'x', body: '', revision: 1 }, a.cookie)).status, 403);
    const versionsResponse = await request(`/pages/${page.id}/versions`, 'GET', undefined, a.cookie);
    assert.equal(versionsResponse.status, 200);
    const versions = await versionsResponse.json() as Array<{ id: string; revision: number; title: string }>;
    assert.equal(versions.length, 1);
    assert.equal(versions[0]?.title, 'Initial');
    assert.equal(versions[0]?.revision, 1);

    const writes = await Promise.all(['one', 'two'].map((body) =>
      request(`/pages/${page.id}`, 'PATCH', { title: 'Changed', body, revision: 1 }, a.cookie, a.csrf)));
    assert.deepEqual(writes.map((res) => res.status).sort(), [200, 409]);
    const afterWrites = await (await request(`/pages/${page.id}/versions`, 'GET', undefined, a.cookie)).json() as Array<{ revision: number }>;
    assert.deepEqual(afterWrites.map((entry) => entry.revision), [2, 1]);
    assert.equal((await request(`/pages/${page.id}/restore`, 'POST', { revision: 1, versionId: versions[0]!.id }, a.cookie, a.csrf)).status, 409);
    assert.equal((await request(`/pages/${page.id}/restore`, 'POST', { revision: 2, versionId: randomUUID() }, a.cookie, a.csrf)).status, 404);
    const restore = await request(`/pages/${page.id}/restore`, 'POST', { revision: 2, versionId: versions[0]!.id }, a.cookie, a.csrf);
    assert.equal(restore.status, 200);
    const restored = await restore.json() as { title: string; body: string; revision: number };
    assert.deepEqual(restored, { id: page.id, bookId: book.id, title: 'Initial', body: 'draft only', revision: 3 });
    const list = await (await request(`/me/books/${book.id}/pages`, 'GET', undefined, a.cookie)).json() as Array<{ id: string }>;
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, page.id);
    assert.equal((await request(`/books/${book.id}/pages`, 'POST', { title: 'Too long', body: 'a'.repeat(12001) }, a.cookie, a.csrf)).status, 400);
    const otherCreate = await request(`/books/${book.id}/pages`, 'POST', { title: 'Delete', body: 'a'.repeat(12000) }, a.cookie, a.csrf);
    const other = await otherCreate.json() as { id: string };
    assert.equal(otherCreate.status, 201);
    assert.equal((await request(`/pages/${other.id}`, 'DELETE', {}, a.cookie, a.csrf)).status, 204);
    assert.equal((await request(`/pages/${other.id}/versions`, 'GET', undefined, a.cookie)).status, 404);
    assert.equal((await request(`/pages/${page.id}/restore`, 'POST', { revision: 3, versionId: 'invalid' }, a.cookie, a.csrf)).status, 400);
    assert.equal((await request(`/books/${book.id}`, 'DELETE', {}, a.cookie, a.csrf)).status, 204);
    assert.equal((await request(`/me/pages/${page.id}`, 'GET', undefined, a.cookie)).status, 404);
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT deleted_at FROM pages WHERE id = ?', [page.id]);
    assert.ok(rows[0]?.deleted_at);

    const raceBook = await (await request('/me/books', 'POST', { slug: `race-${suffix}`, title: 'Race', description: '' }, a.cookie, a.csrf)).json() as { id: string };
    const racePage = await (await request(`/books/${raceBook.id}/pages`, 'POST', { title: 'Race', body: '' }, a.cookie, a.csrf)).json() as { id: string };
    const [deleteBook, updatePage] = await Promise.all([
      request(`/books/${raceBook.id}`, 'DELETE', {}, a.cookie, a.csrf),
      request(`/pages/${racePage.id}`, 'PATCH', { title: 'Race', body: 'update', revision: 1 }, a.cookie, a.csrf),
    ]);
    assert.equal(deleteBook.status, 204);
    assert.ok([200, 404].includes(updatePage.status), `Unexpected concurrent update status: ${updatePage.status}`);
    assert.equal((await request(`/me/pages/${racePage.id}`, 'GET', undefined, a.cookie)).status, 404);
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email IN (?, ?)', emails);
    for (const user of users) {
      await pool.execute('DELETE pv FROM page_versions pv JOIN pages p ON p.id = pv.page_id JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE p FROM pages p JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE b FROM books b JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});
