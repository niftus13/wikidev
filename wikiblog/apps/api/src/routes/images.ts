import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { ImageController } from '../controllers/images.ts';

export const IMAGE_UPLOAD_PATH = '/me/images';

export function imageRoutes(controller: ImageController): ExpressRouter {
  const router = Router();
  router.post(IMAGE_UPLOAD_PATH, controller.authorize, controller.body, controller.upload);
  router.get('/images/:imageId', controller.get);
  return router;
}
