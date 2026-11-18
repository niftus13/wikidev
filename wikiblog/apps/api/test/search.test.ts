import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { PageDraftDto, SearchResultDto } from '@wikiblog/dto';
import { databaseOptions } from '../src/config.ts';

test('search returns public books and published content only', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const email = `search-${suffix}@example.test`;
  const handle = `s-${suffix}`;
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
  async function search(q: string) {
    const response = await request(`/search?q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200);
    return await response.json() as SearchResultDto[];
  }
  try {
    const registered = await request('/auth/register', 'POST', { email, handle, password: 'integration-password-123' });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const auth = await registered.json() as { csrfToken: string; space: { id: string } };
    const slug = `book-${suffix}`;
    const created = await request('/me/books', 'POST', { slug, title: `Book ${suffix}`, description: 'Introduction' }, cookie, auth.csrfToken);
    assert.equal(created.status, 201);
    const book = await created.json() as { id: string };
    const bookBySlug = await request(`/spaces/${handle}/books/${slug}`);
    assert.equal(bookBySlug.status, 200);
    assert.equal((await bookBySlug.json() as { id: string; handle: string }).handle, handle);
    assert.equal((await request(`/spaces/${handle}/books/missing`)).status, 404);
    assert.equal((await request('/search?q=')).status, 400);
    assert.equal((await request(`/search?q=${'a'.repeat(201)}`)).status, 400);
    assert.equal((await search(`Book ${suffix}`))[0]?.bookId, book.id);
    assert.deepEqual(await search(`Book ${suffix}%`), []);
    assert.deepEqual(await search(`Book ${suffix}_`), []);
    for (let i = 0; i < 51; i++) {
      await pool.execute('INSERT INTO books (id, space_id, slug, title, description) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), auth.space.id, `limit-${suffix}-${i}`, `limit-${suffix} ${i}`, '']);
    }
    assert.equal((await search(`limit-${suffix}`)).length, 50);
    const createdPage = await request(`/books/${book.id}/pages`, 'POST',
      { title: `Page ${suffix}`, body: `published-${suffix}` }, cookie, auth.csrfToken);
    assert.equal(createdPage.status, 201);
    const page = await createdPage.json() as PageDraftDto;
    assert.deepEqual(await search(`published-${suffix}`), []);
    assert.equal((await request(`/pages/${page.id}/publish`, 'POST', { revision: 1 }, cookie, auth.csrfToken)).status, 200);
    const pageResults = await search(`published-${suffix}`);
    assert.equal(pageResults.length, 1);
    assert.equal(pageResults[0]?.id, page.id);
    assert.equal(pageResults[0]?.handle, handle);
    assert.equal((await request(`/pages/${page.id}`, 'PATCH',
      { title: `Draft ${suffix}`, body: `draftonly-${suffix}`, revision: 1 }, cookie, auth.csrfToken)).status, 200);
    assert.deepEqual(await search(`draftonly-${suffix}`), []);
    assert.equal((await search(`published-${suffix}`))[0]?.title, `Page ${suffix}`);
    assert.equal((await request(`/pages/${page.id}`, 'DELETE', {}, cookie, auth.csrfToken)).status, 204);
    assert.deepEqual(await search(`published-${suffix}`), []);
    await pool.execute("UPDATE users SET status = 'disabled' WHERE email = ?", [email]);
    assert.deepEqual(await search(`Book ${suffix}`), []);
    assert.equal((await request(`/spaces/${handle}/books/${slug}`)).status, 404);
    await pool.execute("UPDATE users SET status = 'active' WHERE email = ?", [email]);
    assert.equal((await request(`/books/${book.id}`, 'DELETE', {}, cookie, auth.csrfToken)).status, 204);
    assert.deepEqual(await search(`Book ${suffix}`), []);
    assert.equal((await request(`/spaces/${handle}/books/${slug}`)).status, 404);
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
    for (const user of users) {
      await pool.execute('UPDATE pages p JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id SET p.parent_id = NULL, p.published_version_id = NULL WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE pv FROM page_versions pv JOIN pages p ON p.id = pv.page_id JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE p FROM pages p JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE b FROM books b JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});
