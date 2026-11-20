import type { CategoryDto } from '@wikiblog/dto';
import { possibleParents } from './toc.ts';

export type CategoryTreeItem = CategoryDto & { depth: number };

/** parentId 목록을 깊이 우선 순서로 펼친다. 형제 순서는 입력 순서(API의 이름순)를 따른다. */
export function categoryTree(categories: CategoryDto[]): CategoryTreeItem[] {
  const ids = new Set(categories.map((category) => category.id));
  const children = new Map<string | null, CategoryDto[]>();
  for (const category of categories) {
    // 부모가 목록에 없으면 최상위로 보여 항목이 사라지지 않게 한다.
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), category]);
  }
  const result: CategoryTreeItem[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const category of children.get(parentId) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      result.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  // 순환 데이터처럼 최상위에서 닿지 않는 항목도 누락하지 않는다.
  for (const category of categories) {
    if (!visited.has(category.id)) {
      visited.add(category.id);
      result.push({ ...category, depth: 0 });
    }
  }
  return result;
}

/** 부모 후보: 트리 순서를 유지하고, 수정 중인 카테고리와 그 자손을 제외한다. */
export function categoryParentOptions(categories: CategoryDto[], categoryId: string | null): CategoryTreeItem[] {
  const tree = categoryTree(categories);
  return categoryId ? possibleParents(tree, categoryId) : tree;
}

/** 선택 목록에 표시할 이름. 깊이를 접두어로 나타낸다. */
export function categoryOptionLabel(item: CategoryTreeItem): string {
  return `${'— '.repeat(item.depth)}${item.name}`;
}

/** 선택된 태그 ID를 중복 없이, 현재 태그 목록 순서로 정리한다. */
export function orderedTagIds(selected: Iterable<string>, tags: Array<{ id: string }>): string[] {
  const chosen = new Set(selected);
  return tags.filter((tag) => chosen.has(tag.id)).map((tag) => tag.id);
}
