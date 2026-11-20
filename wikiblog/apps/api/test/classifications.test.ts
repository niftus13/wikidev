import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions } from '../src/config.ts';

test('classification ownership, snapshots, hierarchy and public filters', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emails = [`class-a-${suffix}@example.test`, `class-b-${suffix}@example.test`];
  const origin = process.env.APP_ORIGIN!;
  async function request(path: string, method = 'GET', body?: unknown, auth?: { cookie: string; csrf: string }) {
    const headers: Record<string, string> = {};
    if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json'; }
    if (auth) { headers.cookie = auth.cookie; headers['x-csrf-token'] = auth.csrf; }
    return fetch(`http://127.0.0.1:4000/api/v1${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function register(email: string, handle: string) {
    const res = await request('/auth/register', 'POST', { email, handle, password: 'integration-password-123' });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const body = await res.json() as { csrfToken: string };
    return { cookie, csrf: body.csrfToken };
  }
  async function create(path: string, body: unknown, auth: { cookie: string; csrf: string }) {
    const response = await request(path, 'POST', body, auth);
    assert.equal(response.status, 201, `${path}: ${await response.clone().text()}`);
    return await response.json() as { id: string };
  }
  async function search(query: string) {
    const res = await request(`/search?${query}`);
    assert.equal(res.status, 200, await res.clone().text());
    return await res.json() as Array<{ id: string; type: string }>;
  }
  try {
    const a = await register(emails[0]!, `ca-${suffix}`);
    const b = await register(emails[1]!, `cb-${suffix}`);
    const book = await create('/me/books', { slug: `book-${suffix}`, title: `Class ${suffix}`, description: '' }, a);
    const foreignBook = await create('/me/books', { slug: `foreign-${suffix}`, title: 'Foreign', description: '' }, b);
    const root = await create('/me/categories', { name: 'Root', parentId: null }, a);
    const child = await create('/me/categories', { name: 'Child', parentId: root.id }, a);
    const raceA = await create('/me/categories', { name: 'Race A', parentId: null }, a);
    const raceB = await create('/me/categories', { name: 'Race B', parentId: null }, a);
    const foreign = await create('/me/categories', { name: 'Foreign', parentId: null }, b);
    const pageRoot = await create(`/books/${book.id}/categories`, { name: 'Page Root', parentId: null }, a);
    const pageChild = await create(`/books/${book.id}/categories`, { name: 'Page Child', parentId: pageRoot.id }, a);
    const foreignPageCat = await create(`/books/${foreignBook.id}/categories`, { name: 'Other', parentId: null }, b);
    const tag = await create('/me/tags', { name: ' #MySQL ' }, a);
    const foreignTag = await create('/me/tags', { name: 'Private' }, b);
    assert.equal((await request('/me/tags', 'POST', { name: 'mysql' }, a)).status, 409);
    assert.equal((await request(`/me/categories/${root.id}`, 'PATCH', { name: 'Root', parentId: child.id }, a)).status, 400);
    assert.equal((await request(`/me/categories/${root.id}`, 'DELETE', {}, a)).status, 409);
    assert.equal((await request(`/me/categories/${root.id}`, 'PATCH', { name: 'Root', parentId: foreign.id }, a)).status, 404);
    const races = await Promise.all([
      request(`/me/categories/${raceA.id}`, 'PATCH', { name: 'Race A', parentId: raceB.id }, a),
      request(`/me/categories/${raceB.id}`, 'PATCH', { name: 'Race B', parentId: raceA.id }, a),
    ]);
    assert.deepEqual(races.map((res) => res.status).sort(), [200, 400]);
    const bookInput = { platformCategoryId: null, spaceCategoryId: child.id, tagIds: [tag.id] };
    assert.equal((await request(`/books/${book.id}/classification`, 'PATCH', { ...bookInput, tagIds: [foreignTag.id] }, a)).status, 404);
    assert.equal((await request(`/books/${book.id}/classification`, 'PATCH', bookInput, b)).status, 404);
    assert.equal((await request(`/books/${book.id}/classification`, 'PATCH', bookInput, a)).status, 200);
    assert.equal((await request(`/me/categories/${child.id}`, 'DELETE', {}, a)).status, 409);
    const bookResults = await search(`categoryId=${root.id}&tag=%23MYSQL`);
    assert.ok(bookResults.some((result) => result.id === book.id));
    assert.equal((await search(`q=nomatch-${suffix}&categoryId=${root.id}&tag=mysql`)).length, 0);

    const page = await create(`/books/${book.id}/pages`, { title: `Page ${suffix}`, body: 'first' }, a);
    const change = { revision: 1, categoryId: pageChild.id, tagIds: [tag.id] };
    assert.equal((await request(`/pages/${page.id}/classification`, 'PATCH', { ...change, categoryId: foreignPageCat.id }, a)).status, 404);
    assert.equal((await request(`/pages/${page.id}/classification`, 'PATCH', change, a)).status, 200);
    assert.equal((await request(`/pages/${page.id}/classification`, 'PATCH', change, a)).status, 409);
    assert.equal((await search(`categoryId=${pageRoot.id}`)).length, 0);
    assert.equal((await request(`/pages/${page.id}/classification`)).status, 404);
    assert.equal((await request(`/pages/${page.id}/publish`, 'POST', { revision: 2 }, a)).status, 200);
    const publicClassification = await (await request(`/pages/${page.id}/classification`)).json() as { categories: Array<{ id: string }>; tags: Array<{ name: string }> };
    assert.equal(publicClassification.categories[0]?.id, pageChild.id);
    assert.equal(publicClassification.tags[0]?.name, 'MySQL');
    assert.ok((await search(`categoryId=${pageRoot.id}&tag=mysql`)).some((row) => row.id === page.id));
    assert.ok((await search(`categoryId=${root.id}`)).some((row) => row.id === page.id));
    const discovery = await (await request('/categories/discover')).json() as Array<{ id: string }>;
    assert.ok(discovery.some((row) => row.id === pageRoot.id));
    assert.equal(discovery.some((row) => row.id === foreign.id), false);
    assert.equal((await request(`/pages/${page.id}`, 'PATCH', { revision: 2, title: 'Edited', body: 'updated' }, a)).status, 200);
    assert.equal((await request(`/pages/${page.id}/publish`, 'POST', { revision: 3 }, a)).status, 200);
    assert.ok((await search(`categoryId=${pageRoot.id}&tag=mysql`)).some((row) => row.id === page.id));
    assert.equal((await request(`/pages/${page.id}/classification`, 'PATCH', { revision: 3, categoryId: null, tagIds: [] }, a)).status, 200);
    assert.ok((await search(`categoryId=${pageRoot.id}&tag=mysql`)).some((row) => row.id === page.id));
    assert.equal(((await (await request(`/pages/${page.id}/classification`)).json()) as { categories: Array<{ id: string }> }).categories[0]?.id, pageChild.id);
    assert.equal((await request(`/pages/${page.id}`, 'PATCH', { revision: 4, title: 'Changed', body: 'second' }, a)).status, 200);
    assert.equal((await request(`/pages/${page.id}/publish`, 'POST', { revision: 5 }, a)).status, 200);
    assert.equal((await search(`categoryId=${pageRoot.id}`)).length, 0);
    assert.deepEqual(await (await request(`/pages/${page.id}/classification`)).json(), { categories: [], tags: [] });
    const versions = await (await request(`/pages/${page.id}/versions`, 'GET', undefined, a)).json() as Array<{ id: string; revision: number }>;
    const classified = versions.find((v) => v.revision === 2);
    assert.ok(classified);
    assert.equal((await request(`/pages/${page.id}/restore`, 'POST', { revision: 5, versionId: classified.id }, a)).status, 200);
    assert.equal((await search(`categoryId=${pageRoot.id}`)).length, 0);
    assert.equal((await request(`/pages/${page.id}/publish`, 'POST', { revision: 6 }, a)).status, 200);
    assert.ok((await search(`categoryId=${pageRoot.id}&tag=mysql`)).some((row) => row.id === page.id));
    assert.equal((await request(`/me/tags/${tag.id}`, 'DELETE', {}, a)).status, 409);
    assert.equal((await request(`/books/${book.id}/categories/${pageChild.id}`, 'DELETE', {}, a)).status, 409);
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email IN (?, ?)', emails);
    for (const user of users) {
      await pool.execute('UPDATE books b JOIN spaces s ON s.id = b.space_id SET b.platform_category_id = NULL, b.space_category_id = NULL WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE bt FROM book_tags bt JOIN books b ON b.id = bt.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('UPDATE pages p JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id SET p.parent_id = NULL, p.published_version_id = NULL WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE vt FROM page_version_tags vt JOIN page_versions v ON v.id = vt.version_id JOIN pages p ON p.id = v.page_id JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE pv FROM page_versions pv JOIN pages p ON p.id = pv.page_id JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE p FROM pages p JOIN books b ON b.id = p.book_id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute("UPDATE categories c JOIN books b ON c.scope = 'book' AND c.scope_id = b.id JOIN spaces s ON s.id = b.space_id SET c.parent_id = NULL WHERE s.owner_id = ?", [user.id]);
      await pool.execute("DELETE c FROM categories c JOIN books b ON c.scope = 'book' AND c.scope_id = b.id JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?", [user.id]);
      await pool.execute('DELETE b FROM books b JOIN spaces s ON s.id = b.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute("UPDATE categories c JOIN spaces s ON c.scope = 'space' AND c.scope_id = s.id SET c.parent_id = NULL WHERE s.owner_id = ?", [user.id]);
      await pool.execute("DELETE c FROM categories c JOIN spaces s ON c.scope = 'space' AND c.scope_id = s.id WHERE s.owner_id = ?", [user.id]);
      await pool.execute('DELETE t FROM tags t JOIN spaces s ON s.id = t.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});

test('platform categories are seeded with six fixed top-level entries', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const response = await fetch('http://127.0.0.1:4000/api/v1/categories');
  assert.equal(response.status, 200);
  const rows = await response.json() as Array<{ id: string; name: string; parentId: string | null; scope: string }>;
  const expected = new Map([
    ['8c1f0a00-0000-4000-8000-000000000001', '개발'],
    ['8c1f0a00-0000-4000-8000-000000000002', '데이터·AI'],
    ['8c1f0a00-0000-4000-8000-000000000003', '디자인'],
    ['8c1f0a00-0000-4000-8000-000000000004', '비즈니스'],
    ['8c1f0a00-0000-4000-8000-000000000005', '학습·교양'],
    ['8c1f0a00-0000-4000-8000-000000000006', '일상·기타'],
  ]);
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.equal(row.name, expected.get(row.id));
    assert.equal(row.parentId, null);
    assert.equal(row.scope, 'platform');
  }
});
