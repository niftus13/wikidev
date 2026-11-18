export function bookPath(handle: string, slug: string): string {
  return `/@${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
}

export function pagePath(handle: string, slug: string, pageId: string): string {
  return `${bookPath(handle, slug)}/${encodeURIComponent(pageId)}`;
}
