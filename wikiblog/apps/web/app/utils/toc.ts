import type { OwnedTocEntryDto } from '@wikiblog/dto';

export function possibleParents(pages: OwnedTocEntryDto[], pageId: string): OwnedTocEntryDto[] {
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
