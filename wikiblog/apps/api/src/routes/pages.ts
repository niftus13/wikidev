import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { PageController } from '../controllers/pages.ts';

export function pageRoutes(controller: PageController): ExpressRouter {
  const router = Router();
  router.get('/me/books/:bookId/pages', controller.list);
  router.get('/me/books/:bookId/toc', controller.ownedToc);
  router.get('/me/pages/:pageId', controller.get);
  router.get('/books/:bookId/toc', controller.publicToc);
  router.patch('/books/:bookId/toc', controller.move);
  router.get('/pages/:pageId', controller.published);
  router.post('/books/:bookId/pages', controller.create);
  router.patch('/pages/:pageId', controller.update);
  router.get('/pages/:pageId/versions', controller.versions);
  router.post('/pages/:pageId/publish', controller.publish);
  router.post('/pages/:pageId/restore', controller.restore);
  router.delete('/pages/:pageId', controller.delete);
  return router;
}
