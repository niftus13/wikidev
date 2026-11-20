import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { CategoryDto, OwnedTocDto, PageDraftDto, PageVersionDto, PublishedPageDto, SearchResultDto, TocEntryDto, UnpublishPageResponse } from '@wikiblog/dto';
import { databaseOptions } from '../src/config.ts';

test('publishing, hierarchy, ordering and public reads', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const emails = [`publish-a-${suffix}@example.test`, `publish-b-${suffix}@example.test`];
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
    const owner = await register(emails[0]!, `p-${suffix}`);
    const other = await register(emails[1]!, `q-${suffix}`);
    async function createBook(auth: typeof owner, slug: string) {
      const response = await request('/me/books', 'POST', { slug, title: 'Book', description: '' }, auth.cookie, auth.csrf);
      assert.equal(response.status, 201);
      return await response.json() as { id: string };
    }
    const book = await createBook(owner, `book-${suffix}`);
    const foreignBook = await createBook(other, `foreign-${suffix}`);
    async function createPage(bookId: string, auth: typeof owner, title: string) {
      const response = await request(`/books/${bookId}/pages`, 'POST', { title, body: `${title} body` }, auth.cookie, auth.csrf);
      assert.equal(response.status, 201);
      return await response.json() as PageDraftDto;
    }
    const root = await createPage(book.id, owner, 'Root');
    const child = await createPage(book.id, owner, 'Child');
    const draft = await createPage(book.id, owner, 'Draft');
    const sibling = await createPage(book.id, owner, 'Sibling');
    const foreign = await createPage(foreignBook.id, other, 'Foreign');
    async function toc() {
      const response = await request(`/me/books/${book.id}/toc`, 'GET', undefined, owner.cookie);
      assert.equal(response.status, 200);
      return await response.json() as OwnedTocDto;
    }
    async function publicToc() {
      const response = await request(`/books/${book.id}/toc`);
      assert.equal(response.status, 200);
      return await response.json() as TocEntryDto[];
    }
    async function move(revision: number, pageId: string, parentId: string | null, position: number, auth = owner) {
      return request(`/books/${book.id}/toc`, 'PATCH', { revision, pageId, parentId, position }, auth.cookie, auth.csrf);
    }
    async function publish(id: string, revision: number, auth = owner) {
      return request(`/pages/${id}/publish`, 'POST', { revision }, auth.cookie, auth.csrf);
    }
    assert.deepEqual(await publicToc(), []);
    assert.equal((await request(`/pages/${root.id}`)).status, 404);
    assert.equal((await request(`/me/books/${book.id}/toc`, 'GET', undefined, other.cookie)).status, 404);
    let revision = (await toc()).revision;
    assert.equal((await move(revision, child.id, foreign.id, 0)).status, 404);
    assert.equal((await move(revision, child.id, root.id, 0, other)).status, 404);
    const moved = await move(revision, child.id, root.id, 0);
    assert.equal(moved.status, 200);
    revision = (await moved.json() as OwnedTocDto).revision;
    assert.equal((await publish(child.id, 1)).status, 409);
    assert.equal((await publish(root.id, 1, other)).status, 404);
    assert.equal((await request(`/pages/${root.id}/publish`, 'POST', { revision: 1 }, owner.cookie)).status, 403);
    assert.equal((await publish(root.id, 1)).status, 200);
    assert.equal((await publish(child.id, 1)).status, 200);
    assert.equal((await publish(sibling.id, 1)).status, 200);
    assert.deepEqual((await publicToc()).map(({ id, parentId }) => ({ id, parentId })), [
      { id: root.id, parentId: null }, { id: child.id, parentId: root.id }, { id: sibling.id, parentId: null },
    ]);
    assert.equal((await move(revision, root.id, child.id, 0)).status, 400);
    assert.equal((await move(revision, root.id, draft.id, 0)).status, 409);
    assert.equal((await move(revision - 1, root.id, null, 0)).status, 409);
    const reordered = await move(revision, sibling.id, null, 0);
    assert.equal(reordered.status, 200);
    revision = (await reordered.json() as OwnedTocDto).revision;
    assert.deepEqual((await publicToc()).map((p) => p.id), [sibling.id, root.id, child.id]);
    const concurrent = await Promise.all([move(revision, root.id, null, 1), move(revision, draft.id, null, 0)]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    assert.deepEqual((await publicToc()).map((p) => p.id), [sibling.id, root.id, child.id]);

    const versionsResponse = await request(`/pages/${root.id}/versions`, 'GET', undefined, owner.cookie);
    const versions = await versionsResponse.json() as PageVersionDto[];
    assert.equal((await request(`/pages/${root.id}`, 'PATCH', { revision: 1, title: 'Edited', body: 'new body' }, owner.cookie, owner.csrf)).status, 200);
    assert.equal((await publish(root.id, 1)).status, 409);
    let publicPage = await (await request(`/pages/${root.id}`)).json() as PublishedPageDto;
    assert.equal(publicPage.title, 'Root');
    assert.equal((await publicToc()).find((p) => p.id === root.id)?.title, 'Root');
    assert.equal((await publish(root.id, 2)).status, 200);
    publicPage = await (await request(`/pages/${root.id}`)).json() as PublishedPageDto;
    assert.equal(publicPage.title, 'Edited');
    assert.equal((await request(`/pages/${root.id}/restore`, 'POST', { revision: 2, versionId: versions[0]!.id }, owner.cookie, owner.csrf)).status, 200);
    publicPage = await (await request(`/pages/${root.id}`)).json() as PublishedPageDto;
    assert.equal(publicPage.title, 'Edited');
    assert.equal((await publish(root.id, 3)).status, 200);
    assert.equal((await request(`/pages/${root.id}`, 'DELETE', {}, owner.cookie, owner.csrf)).status, 204);
    assert.equal((await request(`/pages/${root.id}`)).status, 404);
    assert.equal((await request(`/pages/${child.id}`)).status, 404);
    assert.equal((await request(`/me/pages/${child.id}`, 'GET', undefined, owner.cookie)).status, 404);
    assert.deepEqual((await publicToc()).map((p) => p.id), [sibling.id]);

    // 발행 취소: 하위 발행 페이지까지 같은 트랜잭션에서 취소되고 공개 조회·목차·검색·분류 필터에서 바로 빠진다.
    const platform = await (await request('/categories')).json() as CategoryDto[];
    const category = platform[0];
    assert.ok(category, 'platform categories are seeded');
    assert.equal((await request(`/books/${book.id}/classification`, 'PATCH',
      { platformCategoryId: category.id, spaceCategoryId: null, tagIds: [] }, owner.cookie, owner.csrf)).status, 200);
    const marker = `unpub${suffix}`;
    async function createMarked(title: string) {
      const response = await request(`/books/${book.id}/pages`, 'POST', { title, body: `${marker} ${title}` }, owner.cookie, owner.csrf);
      assert.equal(response.status, 201);
      return await response.json() as PageDraftDto;
    }
    const upParent = await createMarked('Unpublish Parent');
    const upChild = await createMarked('Unpublish Child');
    const upGrandchild = await createMarked('Unpublish Grandchild');
    const upDraftChild = await createMarked('Unpublish Draft Child');
    revision = (await toc()).revision;
    for (const [pageId, parentId] of [[upChild.id, upParent.id], [upGrandchild.id, upChild.id], [upDraftChild.id, upParent.id]] as const) {
      const response = await move(revision, pageId, parentId, 0);
      assert.equal(response.status, 200);
      revision = (await response.json() as OwnedTocDto).revision;
    }
    for (const page of [upParent, upChild, upGrandchild]) assert.equal((await publish(page.id, 1)).status, 200);
    async function searchIds(query: string) {
      const response = await request(`/search?${query}`);
      assert.equal(response.status, 200);
      return (await response.json() as SearchResultDto[]).map((row) => row.id);
    }
    const published = [upParent.id, upChild.id, upGrandchild.id];
    assert.deepEqual((await searchIds(`q=${marker}`)).sort(), [...published].sort());
    for (const id of published) assert.ok((await searchIds(`categoryId=${category.id}`)).includes(id));
    async function unpublish(id: string, auth = owner, csrf = auth.csrf) {
      return request(`/pages/${id}/unpublish`, 'POST', {}, auth.cookie, csrf);
    }
    assert.equal((await unpublish(upParent.id, other)).status, 404);
    assert.equal((await unpublish(foreign.id)).status, 404);
    assert.equal((await unpublish(upParent.id, owner, '')).status, 403);
    assert.equal((await request(`/pages/${upParent.id}/unpublish`, 'POST', {})).status, 401);
    assert.equal((await unpublish('not-a-uuid')).status, 404);
    assert.equal((await request(`/pages/${upParent.id}`)).status, 200);
    const childOnly = await unpublish(upChild.id);
    assert.equal(childOnly.status, 200);
    assert.deepEqual(await childOnly.json() as UnpublishPageResponse, { id: upChild.id, unpublishedPageIds: [upChild.id, upGrandchild.id] });
    assert.equal((await request(`/pages/${upParent.id}`)).status, 200);
    assert.equal((await request(`/pages/${upGrandchild.id}`)).status, 404);
    assert.equal((await publish(upChild.id, 1)).status, 200);
    assert.equal((await publish(upGrandchild.id, 1)).status, 200);
    const unpublished = await unpublish(upParent.id);
    assert.equal(unpublished.status, 200);
    assert.deepEqual(await unpublished.json() as UnpublishPageResponse, { id: upParent.id, unpublishedPageIds: published });
    for (const id of published) {
      assert.equal((await request(`/pages/${id}`)).status, 404);
      assert.equal((await request(`/pages/${id}/classification`)).status, 404);
    }
    assert.equal((await publicToc()).some((entry) => published.includes(entry.id)), false);
    const ownedAfter = await toc();
    for (const id of [...published, upDraftChild.id]) assert.equal(ownedAfter.pages.find((entry) => entry.id === id)?.published, false);
    assert.deepEqual(await searchIds(`q=${marker}`), []);
    const categoryResults = await searchIds(`categoryId=${category.id}`);
    assert.equal(categoryResults.some((id) => published.includes(id)), false);
    assert.ok(categoryResults.includes(book.id), 'the book itself stays public');
    const again = await unpublish(upParent.id);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json() as UnpublishPageResponse, { id: upParent.id, unpublishedPageIds: [] });
    const draft2 = await (await request(`/me/pages/${upParent.id}`, 'GET', undefined, owner.cookie)).json() as PageDraftDto;
    assert.equal(draft2.revision, 1);
    assert.equal((await request(`/pages/${upParent.id}/versions`, 'GET', undefined, owner.cookie)).status, 200);
    assert.equal((await publish(upChild.id, 1)).status, 409, 'child cannot be republished before its parent');
    assert.equal((await request(`/pages/${upParent.id}`, 'PATCH', { revision: 1, title: 'Republished Parent', body: `${marker} again` }, owner.cookie, owner.csrf)).status, 200);
    assert.equal((await publish(upParent.id, 2)).status, 200);
    const republished = await (await request(`/pages/${upParent.id}`)).json() as PublishedPageDto;
    assert.equal(republished.title, 'Republished Parent');
    assert.deepEqual(await searchIds(`q=${marker}`), [upParent.id]);
    assert.ok((await publicToc()).some((entry) => entry.id === upParent.id));
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email IN (?, ?)', emails);
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
