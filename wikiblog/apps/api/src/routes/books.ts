import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { BookController } from '../controllers/books.ts';

export function bookRoutes(controller: BookController): ExpressRouter {
  const router = Router();
  router.get('/books', controller.list);
  router.get('/books/:id', controller.get);
  router.get('/me/books', controller.listOwned);
  router.post('/me/books', controller.create);
  router.patch('/books/:id', controller.update);
  router.delete('/books/:id', controller.delete);
  return router;
}
