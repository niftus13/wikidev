import type { SearchResultDto } from '@wikiblog/dto';
import { SearchRepository } from '../repositories/search.ts';
import { HttpError } from './errors.ts';
import { validId } from './pages.ts';
import { normalizeTag } from './classifications.ts';

export class SearchService {
  readonly repository: SearchRepository;
  constructor(repository: SearchRepository) { this.repository = repository; }

  async search(input: unknown, categoryInput?: unknown, tagInput?: unknown): Promise<SearchResultDto[]> {
    if (input !== undefined && typeof input !== 'string') throw new HttpError(400, 'Invalid search query');
    const query = typeof input === 'string' ? input.trim() : '';
    if (Array.from(query).length > 200) {
      throw new HttpError(400, 'Search query must contain 1 to 200 characters');
    }
    if (categoryInput !== undefined && !validId(categoryInput)) throw new HttpError(400, 'Invalid category ID');
    const categoryId = validId(categoryInput) ? categoryInput : null;
    const tag = tagInput === undefined ? null : normalizeTag(tagInput).normalized;
    if (!query && !categoryId && !tag) throw new HttpError(400, 'Search query or filter is required');
    return (await this.repository.search(query, categoryId, tag)).map((row) => ({
      type: row.result_type,
      id: row.id,
      title: row.title,
      bookId: row.book_id,
      bookSlug: row.book_slug,
      bookTitle: row.book_title,
      handle: row.handle,
      excerpt: Array.from(row.excerpt).slice(0, 160).join(''),
    }));
  }
}
