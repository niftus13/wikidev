import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { SearchController } from '../controllers/search.ts';

export function searchRoutes(controller: SearchController): ExpressRouter {
  const router = Router();
  router.get('/search', controller.search);
  return router;
}
