import type { Request, Response } from 'express';
import type { AuthController } from './auth.ts';
import type { ClassificationService } from '../services/classifications.ts';
import { HttpError } from '../services/errors.ts';
import { validId } from '../services/pages.ts';

function id(request: Request, key: string) {
  const value = request.params[key];
  if (!validId(value)) throw new HttpError(404, 'Resource not found');
  return value;
}

export class ClassificationController {
  readonly service: ClassificationService;
  readonly auth: AuthController;
  constructor(service: ClassificationService, auth: AuthController) { this.service = service; this.auth = auth; }
  platform = async (_req: Request, res: Response) => { res.json(await this.service.platformCategories()); };
  discover = async (_req: Request, res: Response) => { res.json(await this.service.discoverCategories()); };
  spaceCategories = async (req: Request, res: Response) => {
    const user = await this.auth.session(req);
    res.json(await this.service.categories('space', user.space_id, user.space_id));
  };
  bookCategories = async (req: Request, res: Response) => {
    const user = await this.auth.session(req);
    res.json(await this.service.categories('book', id(req, 'bookId'), user.space_id));
  };
  saveSpace = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    res.status(req.method === 'POST' ? 201 : 200).json(await this.service.saveCategory('space', user.space_id, user.space_id, req.method === 'POST' ? null : id(req, 'categoryId'), req.body ?? {}));
  };
  saveBook = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    res.status(req.method === 'POST' ? 201 : 200).json(await this.service.saveCategory('book', id(req, 'bookId'), user.space_id, req.method === 'POST' ? null : id(req, 'categoryId'), req.body ?? {}));
  };
  deleteSpace = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    await this.service.deleteCategory('space', user.space_id, user.space_id, id(req, 'categoryId'));
    res.status(204).end();
  };
  deleteBook = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    await this.service.deleteCategory('book', id(req, 'bookId'), user.space_id, id(req, 'categoryId'));
    res.status(204).end();
  };
  tags = async (req: Request, res: Response) => { const user = await this.auth.session(req); res.json(await this.service.tags(user.space_id)); };
  createTag = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    res.status(201).json(await this.service.createTag(user.space_id, req.body?.name));
  };
  deleteTag = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    await this.service.deleteTag(user.space_id, id(req, 'tagId'));
    res.status(204).end();
  };
  book = async (req: Request, res: Response) => {
    const user = await this.auth.session(req);
    res.json(await this.service.book(id(req, 'bookId'), user.space_id));
  };
  publicBook = async (req: Request, res: Response) => {
    res.json(await this.service.publicClassification(id(req, 'bookId'), 'book'));
  };
  publicPage = async (req: Request, res: Response) => {
    res.json(await this.service.publicClassification(id(req, 'pageId'), 'page'));
  };
  setBook = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    res.json(await this.service.setBook(id(req, 'bookId'), user.space_id, req.body ?? {}));
  };
  page = async (req: Request, res: Response) => {
    const user = await this.auth.session(req);
    res.json(await this.service.page(id(req, 'pageId'), user.space_id));
  };
  setPage = async (req: Request, res: Response) => {
    const user = await this.auth.mutationSession(req);
    res.json(await this.service.setPage(id(req, 'pageId'), user.space_id, user.user_id, req.body ?? {}));
  };
}
