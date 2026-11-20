import assert from 'node:assert/strict';
import test from 'node:test';
import type { OwnedTocEntryDto } from '@wikiblog/dto';
import {
  altFromFileName,
  checkErrorMessage,
  checkImageFile,
  createTempId,
  dragHasFiles,
  filesFromDataTransfer,
  finalImageBytes,
  hasPlaceholder,
  IMAGE_ACCEPT,
  imageMarkdown,
  insertBlock,
  MAX_IMAGE_BYTES,
  placeholderMarkdown,
  removePlaceholder,
  replacePlaceholder,
  uploadErrorMessage,
  utf8Bytes,
} from '../app/utils/imageUpload.ts';
import { renderMarkdown } from '../app/utils/markdown.ts';
import { publishedDescendantCount } from '../app/utils/toc.ts';

const IMAGE_URL = '/api/v1/images/0b7e3c2a-4d5f-4a6b-8c9d-0e1f2a3b4c5d';

test('pre-check accepts the four allowed types up to 2 MiB and rejects SVG, other types, empty and oversized files', () => {
  assert.equal(IMAGE_ACCEPT, 'image/png,image/jpeg,image/webp,image/gif');
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    assert.equal(checkImageFile({ type, size: 10 }), null);
  }
  assert.equal(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES }), null);
  assert.equal(checkImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), 'size');
  assert.equal(checkImageFile({ type: 'image/svg+xml', size: 10 }), 'type');
  assert.equal(checkImageFile({ type: '', size: 10 }), 'type');
  assert.equal(checkImageFile({ type: 'text/plain', size: 10 }), 'type');
  assert.equal(checkImageFile({ type: 'image/png', size: 0 }), 'empty');
  assert.match(checkErrorMessage('type'), /PNG·JPEG·WebP·GIF/);
  assert.match(checkErrorMessage('size'), /2MB 이하/);
});

test('alt text drops the extension and characters that break Markdown, falling back to 이미지', () => {
  assert.equal(altFromFileName('diagram.png'), 'diagram');
  assert.equal(altFromFileName('my [draft] shot\\1.final.JPEG'), 'my draft shot 1.final');
  assert.equal(altFromFileName('line\nbreak\t.gif'), 'line break');
  assert.equal(altFromFileName('.png'), '이미지');
  assert.equal(altFromFileName('[]'), '이미지');
  assert.equal(altFromFileName(''), '이미지');
  assert.equal(altFromFileName(undefined), '이미지');
  assert.equal(Array.from(altFromFileName(`${'가'.repeat(150)}.png`)).length, 100);
  // 정리한 alt로 만든 Markdown은 실제 이미지로 렌더링된다.
  assert.match(renderMarkdown(imageMarkdown(altFromFileName('a ] (b) [c.png'), IMAGE_URL)), /<img src="\/api\/v1\/images\/[^"]+" alt="a \(b\) c"/);
});

test('blocks are inserted at the cursor as their own paragraph and the cursor moves after the inserted text', () => {
  assert.deepEqual(insertBlock('', 0, 0, 'X'), { body: 'X', cursor: 1 });
  assert.deepEqual(insertBlock('abcdef', 3, 3, 'X'), { body: 'abc\n\nX\n\ndef', cursor: 6 });
  assert.deepEqual(insertBlock('abc\n\ndef', 5, 5, 'X'), { body: 'abc\n\nX\n\ndef', cursor: 6 });
  assert.deepEqual(insertBlock('abc\ndef', 4, 4, 'X'), { body: 'abc\n\nX\n\ndef', cursor: 6 });
  assert.deepEqual(insertBlock('abc', 3, 3, 'X'), { body: 'abc\n\nX', cursor: 6 });
  assert.deepEqual(insertBlock('abc', 0, 0, 'X'), { body: 'X\n\nabc', cursor: 1 });
  // 선택 영역은 바꾸고, 범위를 벗어난 위치는 본문 안으로 맞춘다.
  assert.deepEqual(insertBlock('a selected b', 2, 10, 'X'), { body: 'a \n\nX\n\n b', cursor: 5 });
  assert.deepEqual(insertBlock('ab', 99, 99, 'X'), { body: 'ab\n\nX', cursor: 5 });
  // 넣은 이미지는 앞뒤 글과 다른 문단으로 렌더링된다.
  const html = renderMarkdown(insertBlock('앞 글', 4, 4, imageMarkdown('x', IMAGE_URL)).body);
  assert.match(html, /<p>앞 글<\/p>\n<p><img /);
});

test('placeholders are unique and replaced only while they remain in the body', () => {
  const first = createTempId();
  const second = createTempId();
  assert.notEqual(first, second);
  const placeholder = placeholderMarkdown('diagram', first);
  assert.equal(placeholder, `![업로드 중: diagram](uploading:${first})`);
  const body = `intro\n${placeholder}\n${placeholderMarkdown('other', second)}\noutro`;
  assert.ok(hasPlaceholder(body, first));
  assert.equal(replacePlaceholder(body, first, imageMarkdown('diagram', IMAGE_URL)),
    `intro\n![diagram](${IMAGE_URL})\n${placeholderMarkdown('other', second)}\noutro`);
  // 사용자가 alt를 고쳤어도 고유 주소가 남아 있으면 바꾼다.
  assert.equal(replacePlaceholder(`![edited](uploading:${first})`, first, 'done'), 'done');
  // 사용자가 임시 자리를 지웠으면 결과를 넣지 않는다.
  assert.equal(replacePlaceholder('intro\noutro', first, 'done'), null);
  assert.equal(replacePlaceholder(`![x](uploading:${first}0)`, first, 'done'), null);
  // replacement 특수 패턴($&)도 그대로 들어간다.
  assert.equal(replacePlaceholder(placeholder, first, '![$&](u)'), '![$&](u)');
});

test('failed uploads remove their placeholder line without touching other text', () => {
  const id = 'abc';
  const placeholder = placeholderMarkdown('x', id);
  assert.equal(removePlaceholder(`a\n${placeholder}\nb`, id), 'a\nb');
  assert.equal(removePlaceholder(`a\n${placeholder}`, id), 'a');
  assert.equal(removePlaceholder(`${placeholder}\nb`, id), 'b');
  assert.equal(removePlaceholder(`a ${placeholder} b`, id), 'a  b');
  assert.equal(removePlaceholder('unchanged', id), 'unchanged');
});

test('placeholders never render as images in preview', () => {
  assert.doesNotMatch(renderMarkdown(placeholderMarkdown('x', 'abc')), /<img/);
});

test('final image size estimate matches the Markdown that is inserted', () => {
  const alt = '그림';
  assert.equal(finalImageBytes(alt), utf8Bytes(`\n\n${imageMarkdown(alt, IMAGE_URL)}\n\n`));
  const inserted = insertBlock('a\nb', 1, 1, imageMarkdown(alt, IMAGE_URL)).body;
  assert.ok(utf8Bytes(inserted) - utf8Bytes('a\nb') <= finalImageBytes(alt));
});

test('server status codes map to the agreed messages', () => {
  assert.match(uploadErrorMessage(415), /PNG·JPEG·WebP·GIF/);
  assert.match(uploadErrorMessage(400), /PNG·JPEG·WebP·GIF/);
  assert.match(uploadErrorMessage(413), /2MB 이하/);
  assert.match(uploadErrorMessage(409), /이미지 저장 공간\(50MB\)을 모두 사용/);
  assert.match(uploadErrorMessage(401), /새 탭에서 로그인/);
  assert.match(uploadErrorMessage(403), /새 탭에서 로그인/);
  assert.match(uploadErrorMessage(500), /다시 시도/);
  assert.match(uploadErrorMessage(undefined), /다시 시도/);
});

test('only file items are taken from clipboard and drop data', () => {
  const png = { name: 'a.png' } as File;
  const items = [
    { kind: 'string', getAsFile: () => null },
    { kind: 'file', getAsFile: () => png },
  ];
  assert.deepEqual(filesFromDataTransfer({ items, files: [] } as unknown as DataTransfer), [png]);
  assert.deepEqual(filesFromDataTransfer({ items: [{ kind: 'string', getAsFile: () => null }], files: [] } as unknown as DataTransfer), []);
  assert.deepEqual(filesFromDataTransfer({ items: [], files: [png] } as unknown as DataTransfer), [png]);
  assert.deepEqual(filesFromDataTransfer(null), []);
  assert.equal(dragHasFiles({ types: ['Files'] } as unknown as DataTransfer), true);
  assert.equal(dragHasFiles({ types: ['text/plain'] } as unknown as DataTransfer), false);
});

test('unpublish confirmation counts only published descendants', () => {
  const page = (id: string, parentId: string | null, published: boolean): OwnedTocEntryDto => ({ id, parentId, published, position: 0, title: id });
  const pages = [
    page('root', null, true),
    page('child', 'root', true),
    page('draft-child', 'root', false),
    page('grandchild', 'child', true),
    page('other', null, true),
  ];
  assert.equal(publishedDescendantCount(pages, 'root'), 2);
  assert.equal(publishedDescendantCount(pages, 'child'), 1);
  assert.equal(publishedDescendantCount(pages, 'other'), 0);
  assert.equal(publishedDescendantCount(pages, 'missing'), 0);
});
