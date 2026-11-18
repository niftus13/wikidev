import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../app/utils/markdown.ts';

test('Markdown renders formatting without executable HTML or unsafe URLs', () => {
  const html = renderMarkdown('# Heading\n\n**bold**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![bad](data:text/html,evil)');
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /<script|href="javascript:|src="data:/i);
  assert.match(renderMarkdown('[safe](https://example.test)'), /href="https:\/\/example.test"/);
});
