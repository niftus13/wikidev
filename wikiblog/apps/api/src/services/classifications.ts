import type { BookClassificationInput, CategoryInput, PageClassificationInput } from '@wikiblog/dto';
import { ClassificationRepository } from '../repositories/classifications.ts';
import { HttpError } from './errors.ts';
import { validId } from './pages.ts';

type Input<T> = Partial<Record<keyof T, unknown>>;
type Scope = 'space' | 'book';

export function normalizeTag(input: unknown) {
  if (typeof input !== 'string') throw new HttpError(400, 'Invalid tag name');
  const name = input.trim().replace(/^#+/, '').trim();
  if (!name || Array.from(name).length > 100) throw new HttpError(400, 'Invalid tag name');
  return { name, normalized: name.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) };
}
function nullableId(value: unknown): string | null {
  if (value === null || validId(value)) return value;
  throw new HttpError(400, 'Invalid category ID');
}
function tags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || !value.every(validId) || new Set(value).size !== value.length) {
    throw new HttpError(400, 'Invalid tag IDs');
  }
  return value;
}
function categoryInput(input: Input<CategoryInput>) {
  if (typeof input.name !== 'string' || !input.name.trim() || Array.from(input.name.trim()).length > 100) {
    throw new HttpError(400, 'Invalid category name');
  }
  return { name: input.name.trim(), parentId: nullableId(input.parentId) };
}
function categoryDto(row: { id: string; scope: 'platform' | 'space' | 'book'; name: string; parent_id: string | null }) {
  return { id: row.id, scope: row.scope, name: row.name, parentId: row.parent_id };
}

export class ClassificationService {
  readonly repository: ClassificationRepository;
  constructor(repository: ClassificationRepository) { this.repository = repository; }
  async platformCategories() { return (await this.repository.platformCategories()).map(categoryDto); }
  async discoverCategories() {
    return (await this.repository.discoverCategories()).map((row) => ({ ...categoryDto(row), scopeLabel: row.scope_label }));
  }
  async categories(scope: Scope, scopeId: string, spaceId: string) {
    return (await this.repository.categories(scope, scopeId, spaceId)).map(categoryDto);
  }
  async saveCategory(scope: Scope, scopeId: string, spaceId: string, id: string | null, input: Input<CategoryInput>) {
    const values = categoryInput(input);
    return categoryDto(await this.repository.saveCategory(scope, scopeId, spaceId, id, values.name, values.parentId));
  }
  async deleteCategory(scope: Scope, scopeId: string, spaceId: string, id: string) {
    await this.repository.deleteCategory(scope, scopeId, spaceId, id);
  }
  async tags(spaceId: string) { return (await this.repository.tags(spaceId)).map(({ id, name }) => ({ id, name })); }
  async createTag(spaceId: string, name: unknown) {
    const value = normalizeTag(name);
    return this.repository.createTag(spaceId, value.name, value.normalized);
  }
  async deleteTag(spaceId: string, id: string) { await this.repository.deleteTag(spaceId, id); }
  async book(bookId: string, spaceId: string) { return this.repository.bookClassification(bookId, spaceId); }
  async publicClassification(id: string, kind: 'book' | 'page') {
    const result = await this.repository.publicClassification(id, kind);
    return { categories: result.categories.map(categoryDto), tags: result.tags.map(({ id: tagId, name }) => ({ id: tagId, name })) };
  }
  async setBook(bookId: string, spaceId: string, input: Input<BookClassificationInput>) {
    return this.repository.setBookClassification(bookId, spaceId, {
      platformCategoryId: nullableId(input.platformCategoryId),
      spaceCategoryId: nullableId(input.spaceCategoryId),
      tagIds: tags(input.tagIds),
    });
  }
  async page(pageId: string, spaceId: string) { return this.repository.pageClassification(pageId, spaceId); }
  async setPage(pageId: string, spaceId: string, authorId: string, input: Input<PageClassificationInput>) {
    if (typeof input.revision !== 'number' || !Number.isInteger(input.revision) || input.revision < 1 || input.revision >= 4294967295) {
      throw new HttpError(400, 'Invalid revision');
    }
    return this.repository.setPageClassification(pageId, spaceId, authorId, input.revision, nullableId(input.categoryId), tags(input.tagIds));
  }
}
