import type { BookDto, CreateBookRequest, PublicBookDto } from '@wikiblog/dto';
import { normalizeHandle } from '@wikiblog/shared';
import type { AuthRepository } from '../repositories/auth.ts';
import { BookRepository } from '../repositories/books.ts';
import { HttpError } from './errors.ts';

type Input = Partial<Record<keyof CreateBookRequest, unknown>>;
type Book = { id: string; space_id: string; slug: string; title: string; description: string };
function toDto(book: Book): BookDto {
  return { id: book.id, spaceId: book.space_id, slug: book.slug, title: book.title, description: book.description };
}
function publicDto(book: Book & { handle: string }): PublicBookDto {
  return { ...toDto(book), handle: book.handle };
}
function validate(body: Input): CreateBookRequest {
  const { slug, title, description } = body;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 ||
      typeof title !== 'string' || !title.trim() || Array.from(title).length > 200 ||
      typeof description !== 'string' || Array.from(description).length > 5000) {
    throw new HttpError(400, 'Invalid book slug, title, or description');
  }
  return { slug, title: title.trim(), description };
}
function duplicate(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

export class BookService {
  readonly repository: BookRepository;
  readonly spaces: Pick<AuthRepository, 'space'>;
  constructor(repository: BookRepository, spaces: Pick<AuthRepository, 'space'>) {
    this.repository = repository;
    this.spaces = spaces;
  }
  async list() { return (await this.repository.list()).map(publicDto); }
  async listBySpace(value: unknown) {
    const handle = normalizeHandle(value);
    if (!handle || !await this.spaces.space(handle)) throw new HttpError(404, 'Space not found');
    return (await this.repository.list(handle)).map(publicDto);
  }
  async listOwned(spaceId: string) { return (await this.repository.listOwned(spaceId)).map(toDto); }
  async get(id: string) {
    const book = await this.repository.find(id);
    if (!book) throw new HttpError(404, 'Book not found');
    return publicDto(book);
  }
  async getBySlug(handle: unknown, slug: unknown) {
    if (typeof handle !== 'string' || !/^[a-z0-9_-]{3,30}$/.test(handle) ||
        typeof slug !== 'string' || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new HttpError(404, 'Book not found');
    }
    const book = await this.repository.findBySlug(handle, slug);
    if (!book) throw new HttpError(404, 'Book not found');
    return publicDto(book);
  }
  async create(spaceId: string, body: Input) {
    const values = validate(body);
    try { return toDto(await this.repository.create(spaceId, values)); }
    catch (error) {
      if (duplicate(error)) throw new HttpError(409, 'Book slug is already in use');
      throw error;
    }
  }
  async update(id: string, spaceId: string, body: Input) {
    const values = validate(body);
    try {
      if (!await this.repository.update(id, spaceId, values)) throw new HttpError(404, 'Book not found');
      return { id, spaceId, ...values } satisfies BookDto;
    } catch (error) {
      if (duplicate(error)) throw new HttpError(409, 'Book slug is already in use');
      throw error;
    }
  }
  async delete(id: string, spaceId: string) {
    if (!await this.repository.delete(id, spaceId)) throw new HttpError(404, 'Book not found');
  }
}
