import type { CreatePageRequest, MovePageRequest, OwnedTocEntryDto, PageDraftDto, PageVersionDto, PublishPageRequest, RestorePageRequest, TocEntryDto, UpdatePageRequest } from '@wikiblog/dto';
import type { PageEntity, PageVersionEntity } from '@wikiblog/entities';
import { PageRepository } from '../repositories/pages.ts';
import { HttpError } from './errors.ts';

type Page = Pick<PageEntity, 'id' | 'book_id' | 'title' | 'body' | 'revision'>;
type Input<T> = Partial<Record<keyof T, unknown>>;
function toDto(page: Page): PageDraftDto {
  return { id: page.id, bookId: page.book_id, title: page.title, body: page.body, revision: page.revision };
}
function versionDto(version: PageVersionEntity): PageVersionDto {
  return { id: version.id, pageId: version.page_id, title: version.title, body: version.body,
    revision: version.revision, authorId: version.author_id, createdAt: version.created_at.toISOString() };
}
type TocNode = Pick<PageEntity, 'id' | 'parent_id' | 'sort_order' | 'published_version_id'> & { title: string };
function tocEntries(rows: TocNode[]): OwnedTocEntryDto[] {
  const children = new Map<string | null, TocNode[]>();
  for (const row of rows) {
    const siblings = children.get(row.parent_id) ?? [];
    siblings.push(row);
    children.set(row.parent_id, siblings);
  }
  const result: OwnedTocEntryDto[] = [];
  const pending = (children.get(null) ?? []).map((row, position) => ({ row, position })).reverse();
  while (pending.length) {
    const { row, position } = pending.pop()!;
    result.push({ id: row.id, parentId: row.parent_id, title: row.title, position, published: row.published_version_id !== null });
    const descendants = (children.get(row.id) ?? []).map((child, index) => ({ row: child, position: index }));
    pending.push(...descendants.reverse());
  }
  if (result.length !== rows.length) throw new Error('Page hierarchy is invalid');
  return result;
}
function content(body: Input<CreatePageRequest>): CreatePageRequest {
  if (typeof body.title !== 'string' || !body.title.trim() || Array.from(body.title).length > 200 ||
      typeof body.body !== 'string' || Buffer.byteLength(body.body, 'utf8') > 12000) {
    throw new HttpError(400, 'Invalid page title or body');
  }
  return { title: body.title.trim(), body: body.body };
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value >= 4294967295) {
    throw new HttpError(400, 'Invalid revision');
  }
  return value;
}
export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export class PageService {
  readonly repository: PageRepository;
  constructor(repository: PageRepository) { this.repository = repository; }
  async list(bookId: string, spaceId: string) { return (await this.repository.list(bookId, spaceId)).map(toDto); }
  async get(id: string, spaceId: string) { return toDto(await this.repository.get(id, spaceId)); }
  async create(bookId: string, spaceId: string, authorId: string, body: Input<CreatePageRequest>) {
    return toDto(await this.repository.create(bookId, spaceId, authorId, content(body)));
  }
  async update(id: string, spaceId: string, authorId: string, body: Input<UpdatePageRequest>) {
    return toDto(await this.repository.update(id, spaceId, authorId, revision(body.revision), content(body)));
  }
  async versions(id: string, spaceId: string) {
    return (await this.repository.versions(id, spaceId)).map(versionDto);
  }
  async restore(id: string, spaceId: string, authorId: string, body: Input<RestorePageRequest>) {
    const expected = revision(body.revision);
    if (!validId(body.versionId)) throw new HttpError(400, 'Invalid version ID');
    return toDto(await this.repository.restore(id, spaceId, authorId, expected, body.versionId));
  }
  async delete(id: string, spaceId: string) { await this.repository.delete(id, spaceId); }
  async publish(id: string, spaceId: string, body: Input<PublishPageRequest>) {
    return toDto(await this.repository.publish(id, spaceId, revision(body.revision)));
  }
  async published(id: string) { return toDto(await this.repository.published(id)); }
  async ownedToc(bookId: string, spaceId: string) {
    const toc = await this.repository.ownedToc(bookId, spaceId);
    return { revision: toc.revision, pages: tocEntries(toc.rows) };
  }
  async publicToc(bookId: string): Promise<TocEntryDto[]> {
    return tocEntries(await this.repository.publicToc(bookId)).map(({ published: _published, ...entry }) => entry);
  }
  async move(bookId: string, spaceId: string, body: Input<MovePageRequest>) {
    const expected = revision(body.revision);
    if (!validId(body.pageId) || !(body.parentId === null || validId(body.parentId)) ||
        typeof body.position !== 'number' || !Number.isSafeInteger(body.position) || body.position < 0) {
      throw new HttpError(400, 'Invalid table of contents move');
    }
    const toc = await this.repository.move(bookId, spaceId, expected, body.pageId, body.parentId, body.position);
    return { revision: toc.revision, pages: tocEntries(toc.rows) };
  }
}
