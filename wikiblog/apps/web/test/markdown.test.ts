import assert from 'node:assert/strict';
import test from 'node:test';
import { isInternalImageUrl, markdownPlainText, renderMarkdown } from '../app/utils/markdown.ts';

const IMAGE_ID = '0b7e3c2a-4d5f-4a6b-8c9d-0e1f2a3b4c5d';

test('Markdown renders formatting without executable HTML or unsafe URLs', () => {
  const html = renderMarkdown('# Heading\n\n**bold**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![bad](data:text/html,evil)');
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /<script|href="javascript:|src="data:/i);
  assert.match(renderMarkdown('[safe](https://example.test)'), /href="https:\/\/example.test"/);
});

test('internal uploaded images are kept with lazy loading attributes', () => {
  const html = renderMarkdown(`![diagram](/api/v1/images/${IMAGE_ID} "Title")`);
  assert.equal(html, `<p><img src="/api/v1/images/${IMAGE_ID}" alt="diagram" title="Title" loading="lazy" decoding="async" /></p>\n`);
});

test('external and malformed images are removed while external links stay', () => {
  const sources = [
    'https://example.test/a.png',
    'http://example.test/a.png',
    '//example.test/a.png',
    'data:image/png;base64,iVBORw0KGgo=',
    `https://evil.test/api/v1/images/${IMAGE_ID}`,
    `/api/v1/images/${IMAGE_ID}?x=1`,
    `/api/v1/images/${IMAGE_ID}/../../me`,
    `/api/v1/images/${IMAGE_ID.toUpperCase()}`,
    '/api/v1/images/not-a-uuid',
    '/other/path.png',
    'uploading:temp-1',
  ];
  for (const src of sources) {
    const html = renderMarkdown(`before ![alt text](${src}) after`);
    assert.doesNotMatch(html, /<img/i, src);
    assert.doesNotMatch(html, /alt text/, src);
    assert.match(html, /before\s+after/, src);
  }
  // markdown-it이 거부한 javascript: 이미지는 글자 그대로 남고 img·src가 생기지 않는다.
  assert.doesNotMatch(renderMarkdown('![x](javascript:alert(1))'), /<img|src=/i);
  assert.doesNotMatch(renderMarkdown('<img src="https://example.test/a.png">'), /<img/);
  assert.match(renderMarkdown('[link](https://example.test/a.png)'), /<a href="https:\/\/example.test\/a.png">link<\/a>/);
  const mixed = renderMarkdown(`![a](https://example.test/a.png) ![b](/api/v1/images/${IMAGE_ID})`);
  assert.equal((mixed.match(/<img/g) ?? []).length, 1);
  assert.match(mixed, new RegExp(`src="/api/v1/images/${IMAGE_ID}"`));
});

test('internal image URL check accepts only the exact upload path', () => {
  assert.equal(isInternalImageUrl(`/api/v1/images/${IMAGE_ID}`), true);
  assert.equal(isInternalImageUrl(`/api/v1/images/${IMAGE_ID}/`), false);
  assert.equal(isInternalImageUrl(undefined), false);
});

test('plain text excludes images', () => {
  assert.equal(markdownPlainText(`Intro ![alt](/api/v1/images/${IMAGE_ID}) end`), 'Intro end');
});
