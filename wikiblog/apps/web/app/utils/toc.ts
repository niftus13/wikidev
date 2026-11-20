import type { OwnedTocEntryDto } from '@wikiblog/dto';

export function possibleParents<T extends { id: string; parentId: string | null }>(pages: T[], pageId: string): T[] {
  const excluded = new Set([pageId]);
  const pending = [pageId];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const page of pages) {
      if (page.parentId === parent && !excluded.has(page.id)) {
        excluded.add(page.id);
        pending.push(page.id);
      }
    }
  }
  return pages.filter((page) => !excluded.has(page.id));
}

export function moveSiblings(pages: OwnedTocEntryDto[], pageId: string, parentId: string | null): OwnedTocEntryDto[] {
  return pages.filter((page) => page.parentId === parentId && page.id !== pageId)
    .sort((a, b) => a.position - b.position);
}

/** 발행 취소 확인용: 페이지의 자손 중 발행된 페이지 수(자기 자신 제외). 서버는 발행된 자손을 함께 취소한다. */
export function publishedDescendantCount(pages: { id: string; parentId: string | null; published: boolean }[], pageId: string): number {
  const descendants = new Set<string>();
  const pending = [pageId];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const page of pages) {
      if (page.parentId === parent && page.id !== pageId && !descendants.has(page.id)) {
        descendants.add(page.id);
        pending.push(page.id);
      }
    }
  }
  return pages.filter((page) => page.published && descendants.has(page.id)).length;
}
