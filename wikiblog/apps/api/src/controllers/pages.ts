import type { Request, Response } from 'express';
import type { CreatePageRequest, MovePageRequest, PublishPageRequest, RestorePageRequest, UpdatePageRequest } from '@wikiblog/dto';
import type { AuthController } from './auth.ts';
import { HttpError } from '../services/errors.ts';
import { validId } from '../services/pages.ts';
import type { PageService } from '../services/pages.ts';

function id(request: Request, name: string): string {
  const value = request.params[name];
  if (!validId(value)) throw new HttpError(404, 'Resource not found');
  return value;
}

export class PageController {
  readonly service: PageService;
  readonly auth: AuthController;
  constructor(service: PageService, auth: AuthController) { this.service = service; this.auth = auth; }
  list = async (request: Request, response: Response) => {
    const current = await this.auth.session(request);
    response.json(await this.service.list(id(request, 'bookId'), current.space_id));
  };
  get = async (request: Request, response: Response) => {
    const current = await this.auth.session(request);
    response.json(await this.service.get(id(request, 'pageId'), current.space_id));
  };
  create = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof CreatePageRequest, unknown>> = request.body ?? {};
    response.status(201).json(await this.service.create(id(request, 'bookId'), current.space_id, current.user_id, body));
  };
  update = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof UpdatePageRequest, unknown>> = request.body ?? {};
    response.json(await this.service.update(id(request, 'pageId'), current.space_id, current.user_id, body));
  };
  versions = async (request: Request, response: Response) => {
    const current = await this.auth.session(request);
    response.json(await this.service.versions(id(request, 'pageId'), current.space_id));
  };
  restore = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof RestorePageRequest, unknown>> = request.body ?? {};
    response.json(await this.service.restore(id(request, 'pageId'), current.space_id, current.user_id, body));
  };
  delete = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    await this.service.delete(id(request, 'pageId'), current.space_id);
    response.status(204).end();
  };
  publish = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof PublishPageRequest, unknown>> = request.body ?? {};
    response.json(await this.service.publish(id(request, 'pageId'), current.space_id, body));
  };
  unpublish = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    response.json(await this.service.unpublish(id(request, 'pageId'), current.space_id));
  };
  published = async (request: Request, response: Response) => {
    response.json(await this.service.published(id(request, 'pageId')));
  };
  ownedToc = async (request: Request, response: Response) => {
    const current = await this.auth.session(request);
    response.json(await this.service.ownedToc(id(request, 'bookId'), current.space_id));
  };
  publicToc = async (request: Request, response: Response) => {
    response.json(await this.service.publicToc(id(request, 'bookId')));
  };
  move = async (request: Request, response: Response) => {
    const current = await this.auth.mutationSession(request);
    const body: Partial<Record<keyof MovePageRequest, unknown>> = request.body ?? {};
    response.json(await this.service.move(id(request, 'bookId'), current.space_id, body));
  };
}
