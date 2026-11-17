import type { BookDto, CreateBookRequest } from '@wikiblog/dto';
import { BookRepository } from '../repositories/books.ts';
import { HttpError } from './errors.ts';

type Input = Partial<Record<keyof CreateBookRequest, unknown>>;
type Book = { id: string; space_id: string; slug: string; title: string; description: string };
function toDto(book: Book): BookDto {
  return { id: book.id, spaceId: book.space_id, slug: book.slug, title: book.title, description: book.description };
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
  constructor(repository: BookRepository) { this.repository = repository; }
  async list() { return (await this.repository.list()).map(toDto); }
  async listOwned(spaceId: string) { return (await this.repository.listOwned(spaceId)).map(toDto); }
  async get(id: string) {
    const book = await this.repository.find(id);
    if (!book) throw new HttpError(404, 'Book not found');
    return toDto(book);
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
