import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownPlainText } from '../app/utils/markdown.ts';
import { formatTitle, joinTitle, META_DESCRIPTION_LIMIT, metaDescription, SITE_DESCRIPTION, SITE_TITLE } from '../app/utils/meta.ts';

test('title template appends the site name once and falls back to the site title', () => {
  assert.equal(formatTitle('로그인'), '로그인 — WikiBlog');
  assert.equal(formatTitle('  여러   칸\n제목 '), '여러 칸 제목 — WikiBlog');
  assert.equal(formatTitle(''), SITE_TITLE);
  assert.equal(formatTitle('   '), SITE_TITLE);
  assert.equal(formatTitle(undefined), SITE_TITLE);
  assert.equal(formatTitle(null), SITE_TITLE);
});

test('page and book titles join with a separator and skip empty parts', () => {
  assert.equal(joinTitle('설치', 'Nuxt 입문'), '설치 · Nuxt 입문');
  assert.equal(joinTitle('설치', '  ', undefined), '설치');
  assert.equal(formatTitle(joinTitle('설치', 'Nuxt 입문')), '설치 · Nuxt 입문 — WikiBlog');
});

test('description collapses whitespace, limits length by code points and falls back', () => {
  assert.equal(metaDescription('  첫 줄\n\n둘째   줄 '), '첫 줄 둘째 줄');
  const long = '가'.repeat(META_DESCRIPTION_LIMIT + 20);
  const excerpt = metaDescription(long);
  assert.equal(Array.from(excerpt).length, META_DESCRIPTION_LIMIT);
  assert.ok(excerpt.endsWith('…'));
  assert.equal(Array.from(metaDescription('😀'.repeat(200))).length, META_DESCRIPTION_LIMIT);
  assert.equal(metaDescription('', ' \n ', '두 번째 후보'), '두 번째 후보');
  assert.equal(metaDescription(undefined, null), SITE_DESCRIPTION);
  assert.equal(metaDescription(), SITE_DESCRIPTION);
});

test('markdown plain text keeps readable text only, without HTML, code blocks or URLs', () => {
  const text = markdownPlainText('# 제목\n\n**굵게** 와 `코드` 그리고 [링크](https://example.test) &amp; 끝\n\n<script>alert(1)</script>\n\n```js\nconst hidden = 1;\n```\n\n![그림](https://example.test/a.png)\n- 항목 하나\n- 항목 둘');
  assert.equal(text, '제목 굵게 와 코드 그리고 링크 & 끝 alert(1) 항목 하나 항목 둘');
  assert.equal(markdownPlainText('a < b 그리고 c > d'), 'a < b 그리고 c > d');
  assert.doesNotMatch(text, /<|>|https?:|hidden/);
  assert.equal(markdownPlainText(''), '');
});
