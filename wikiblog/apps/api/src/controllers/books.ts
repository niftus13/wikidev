import type { Request, Response } from 'express';
import type { CreateBookRequest, UpdateBookRequest } from '@wikiblog/dto';
import type { AuthController } from './auth.ts';
import type { BookService } from '../services/books.ts';
import { HttpError } from '../services/errors.ts';

function bookId(request: Request): string {
  const id = request.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new HttpError(404, 'Book not found');
  }
  return id;
}

export class BookController {
  readonly service: BookService;
  readonly auth: AuthController;
  constructor(service: BookService, auth: AuthController) { this.service = service; this.auth = auth; }
  list = async (_request: Request, response: Response) => { response.json(await this.service.list()); };
  listOwned = async (request: Request, response: Response) => {
    const current = await this.auth.session(request);
    response.json(await this.service.listOwned(current.space_id));
  };
  get = async (request: Request, response: Response) => { response.json(await this.service.get(bookId(request))); };
  create = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof CreateBookRequest, unknown>> = request.body ?? {};
    response.status(201).json(await this.service.create(current.space_id, body));
  };
  update = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof UpdateBookRequest, unknown>> = request.body ?? {};
    response.json(await this.service.update(bookId(request), current.space_id, body));
  };
  delete = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    await this.service.delete(bookId(request), current.space_id);
    response.status(204).end();
  };
}
