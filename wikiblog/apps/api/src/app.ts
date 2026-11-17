import express from 'express';
import type { Application, ErrorRequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import { AuthController } from './controllers/auth.ts';
import { BookController } from './controllers/books.ts';
import type { SecurityConfig } from './controllers/auth.ts';
import { AuthRepository } from './repositories/auth.ts';
import { BookRepository } from './repositories/books.ts';
import { authRoutes } from './routes/auth.ts';
import { bookRoutes } from './routes/books.ts';
import { AuthService } from './services/auth.ts';
import type { RedisClient } from './services/auth.ts';
import { HttpError } from './services/errors.ts';
import { BookService } from './services/books.ts';

export function createApp(pool: Pool, redis: RedisClient, config: SecurityConfig): Application {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', async (_request, response) => {
    try {
      await Promise.all([pool.query('SELECT 1'), redis.ping()]);
      response.json({ status: 'ok', mysql: 'ok', redis: 'ok' });
    } catch (error) {
      console.error('Health check failed:', error);
      response.status(503).json({ status: 'unavailable' });
    }
  });
  app.use('/api/v1', (request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.get('origin') !== config.origin) return next(new HttpError(403, 'Invalid origin'));
      if (!request.is('application/json')) return next(new HttpError(415, 'Content-Type must be application/json'));
    }
    next();
  });
  app.use('/api/v1', express.json({ limit: '16kb' }));
  const auth = new AuthController(new AuthService(new AuthRepository(pool), redis), config);
  app.use('/api/v1', authRoutes(auth));
  app.use('/api/v1', bookRoutes(new BookController(new BookService(new BookRepository(pool)), auth)));

  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    if (error instanceof Error && 'status' in error && error.status === 413) {
      response.status(413).json({ error: 'Request body too large' });
      return;
    }
    console.error('API request failed:', error);
    response.status(500).json({ error: 'Internal server error' });
  };
  app.use(errors);
  return app;
}
