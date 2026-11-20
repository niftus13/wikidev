import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import type { AuthController } from '../controllers/auth.ts';

export function authRoutes(controller: AuthController): ExpressRouter {
  const router = Router();
  router.post('/auth/register', controller.register);
  router.post('/auth/login', controller.login);
  router.get('/auth/session', controller.getSession);
  router.post('/auth/logout', controller.logout);
  router.get('/spaces/:handle', controller.getSpace);
  router.patch('/spaces/:handle', controller.updateSpace);
  return router;
}
