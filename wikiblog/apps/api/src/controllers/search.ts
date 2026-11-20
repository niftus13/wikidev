import type { Request, Response } from 'express';
import type { SearchService } from '../services/search.ts';

export class SearchController {
  readonly service: SearchService;
  constructor(service: SearchService) { this.service = service; }
  search = async (request: Request, response: Response) => {
    response.json(await this.service.search(request.query.q, request.query.categoryId, request.query.tag));
  };
}
