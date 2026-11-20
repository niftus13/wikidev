import assert from 'node:assert/strict';
import test from 'node:test';
import type { OwnedTocEntryDto } from '@wikiblog/dto';
import { moveSiblings, possibleParents } from '../app/utils/toc.ts';

const page = (id: string, parentId: string | null, position: number): OwnedTocEntryDto => ({
  id, parentId, position, title: id, published: false,
});
const pages = [
  page('grandchild', 'child', 0),
  page('sibling', null, 1),
  page('root', null, 0),
  page('child', 'root', 0),
  page('other-child', 'sibling', 0),
];

test('parent choices exclude the page and its entire subtree', () => {
  assert.deepEqual(possibleParents(pages, 'root').map((item) => item.id), ['sibling', 'other-child']);
  assert.deepEqual(possibleParents(pages, 'child').map((item) => item.id), ['sibling', 'root', 'other-child']);
});

test('move positions use sorted target siblings after removing the moved page', () => {
  assert.deepEqual(moveSiblings(pages, 'root', null).map((item) => item.id), ['sibling']);
  assert.deepEqual(moveSiblings(pages, 'child', null).map((item) => item.id), ['root', 'sibling']);
  assert.deepEqual(moveSiblings(pages, 'root', 'sibling').map((item) => item.id), ['other-child']);
});
