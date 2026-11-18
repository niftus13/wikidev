import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { ClassificationController } from '../controllers/classifications.ts';

export function classificationRoutes(controller: ClassificationController): ExpressRouter {
  const router = Router();
  router.get('/categories', controller.platform);
  router.get('/categories/discover', controller.discover);
  router.get('/me/categories', controller.spaceCategories);
  router.post('/me/categories', controller.saveSpace);
  router.patch('/me/categories/:categoryId', controller.saveSpace);
  router.delete('/me/categories/:categoryId', controller.deleteSpace);
  router.get('/me/books/:bookId/categories', controller.bookCategories);
  router.post('/books/:bookId/categories', controller.saveBook);
  router.patch('/books/:bookId/categories/:categoryId', controller.saveBook);
  router.delete('/books/:bookId/categories/:categoryId', controller.deleteBook);
  router.get('/me/tags', controller.tags);
  router.post('/me/tags', controller.createTag);
  router.delete('/me/tags/:tagId', controller.deleteTag);
  router.get('/me/books/:bookId/classification', controller.book);
  router.get('/books/:bookId/classification', controller.publicBook);
  router.patch('/books/:bookId/classification', controller.setBook);
  router.get('/me/pages/:pageId/classification', controller.page);
  router.get('/pages/:pageId/classification', controller.publicPage);
  router.patch('/pages/:pageId/classification', controller.setPage);
  return router;
}
