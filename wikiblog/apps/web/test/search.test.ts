import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarInitial, normalizeSearchQuery, sameSearchQuery, SEARCH_RESULT_LIMIT } from '../app/utils/search.ts';

test('search query keeps trimmed non-empty strings only', () => {
  assert.deepEqual(normalizeSearchQuery({ q: '  vue  ', categoryId: 'c1', tag: ' #nuxt ' }), { q: 'vue', categoryId: 'c1', tag: '#nuxt' });
  assert.deepEqual(normalizeSearchQuery({ q: '   ', categoryId: '', tag: undefined }), {});
});

test('search query ignores non-string values such as repeated URL parameters', () => {
  assert.deepEqual(normalizeSearchQuery({ q: ['a', 'b'], categoryId: null, tag: 3 }), {});
});

test('same search query compares every criterion', () => {
  assert.equal(sameSearchQuery({ q: 'a' }, normalizeSearchQuery({ q: ' a ' })), true);
  assert.equal(sameSearchQuery({ q: 'a' }, { q: 'a', tag: 't' }), false);
  assert.equal(sameSearchQuery({}, {}), true);
});

test('avatar initial is the first code point in upper case', () => {
  assert.equal(avatarInitial('ua81102'), 'U');
  assert.equal(avatarInitial('한글'), '한');
  assert.equal(avatarInitial('😀abc'), '😀');
  assert.equal(avatarInitial(''), '?');
});

test('search result limit matches the API maximum', () => {
  assert.equal(SEARCH_RESULT_LIMIT, 50);
});
