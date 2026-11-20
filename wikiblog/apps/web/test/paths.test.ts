import assert from 'node:assert/strict';
import test from 'node:test';
import { bookPath, pagePath, spacePath } from '../app/utils/paths.ts';
import { characterCount, descriptionExcerpt, SPACE_DESCRIPTION_LIMIT } from '../app/utils/space.ts';

test('space path is the handle under /@ and book and page paths extend it', () => {
  assert.equal(spacePath('ua81102'), '/@ua81102');
  assert.equal(bookPath('ua81102', 'my-book'), '/@ua81102/my-book');
  assert.equal(pagePath('ua81102', 'my-book', 'p1'), '/@ua81102/my-book/p1');
});

test('space path encodes characters that would change the URL structure', () => {
  assert.equal(spacePath('a/b?c#d'), '/@a%2Fb%3Fc%23d');
  assert.equal(spacePath('한글'), '/@%ED%95%9C%EA%B8%80');
});

test('character count follows code points like the server limit', () => {
  assert.equal(SPACE_DESCRIPTION_LIMIT, 500);
  assert.equal(characterCount('😀😀'), 2);
  assert.equal(characterCount('가나다\n'), 4);
  assert.equal(characterCount('😀'.repeat(500)), 500);
});

test('description excerpt collapses whitespace and truncates without splitting surrogate pairs', () => {
  assert.equal(descriptionExcerpt('  첫 줄\n\n둘째   줄 '), '첫 줄 둘째 줄');
  assert.equal(descriptionExcerpt('😀'.repeat(10), 5), '😀😀😀😀…');
  assert.equal(descriptionExcerpt('abcde', 5), 'abcde');
  assert.equal(descriptionExcerpt(''), '');
});
