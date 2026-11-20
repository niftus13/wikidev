export function spacePath(handle: string): string {
  return `/@${encodeURIComponent(handle)}`;
}

export function bookPath(handle: string, slug: string): string {
  return `${spacePath(handle)}/${encodeURIComponent(slug)}`;
}

export function pagePath(handle: string, slug: string, pageId: string): string {
  return `${bookPath(handle, slug)}/${encodeURIComponent(pageId)}`;
}
