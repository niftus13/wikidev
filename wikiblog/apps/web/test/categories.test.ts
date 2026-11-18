import assert from 'node:assert/strict';
import test from 'node:test';
import type { CategoryDto } from '@wikiblog/dto';
import { categoryOptionLabel, categoryParentOptions, categoryTree, orderedTagIds } from '../app/utils/categories.ts';

const category = (id: string, parentId: string | null): CategoryDto => ({ id, parentId, name: id, scope: 'space' });
// API는 이름순으로 반환하므로 자식이 부모보다 앞에 올 수 있다.
const categories = [
  category('a-child', 'root'),
  category('b-grandchild', 'a-child'),
  category('other', null),
  category('other-child', 'other'),
  category('root', null),
];

test('category tree lists parents before children in depth-first order with depth', () => {
  assert.deepEqual(categoryTree(categories).map((item) => [item.id, item.depth]), [
    ['other', 0], ['other-child', 1], ['root', 0], ['a-child', 1], ['b-grandchild', 2],
  ]);
});

test('category tree keeps orphaned or cyclic items visible as top-level entries', () => {
  const tree = categoryTree([category('orphan', 'missing'), category('x', 'y'), category('y', 'x')]);
  assert.deepEqual(tree.map((item) => item.id).sort(), ['orphan', 'x', 'y']);
  assert.equal(tree.find((item) => item.id === 'orphan')?.depth, 0);
});

test('parent options exclude the edited category and all of its descendants', () => {
  assert.deepEqual(categoryParentOptions(categories, 'root').map((item) => item.id), ['other', 'other-child']);
  assert.deepEqual(categoryParentOptions(categories, 'a-child').map((item) => item.id), ['other', 'other-child', 'root']);
  assert.deepEqual(categoryParentOptions(categories, null).map((item) => item.id), ['other', 'other-child', 'root', 'a-child', 'b-grandchild']);
});

test('option labels show depth and tag IDs are de-duplicated in tag list order', () => {
  assert.equal(categoryOptionLabel({ ...category('leaf', 'p'), depth: 2 }), '— — leaf');
  assert.deepEqual(orderedTagIds(['t3', 't1', 't3', 'unknown'], [{ id: 't1' }, { id: 't2' }, { id: 't3' }]), ['t1', 't3']);
});
