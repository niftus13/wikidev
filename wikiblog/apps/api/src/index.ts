import { createClient } from 'redis';
import { createApp } from './app.ts';
import { createPool, required, securityConfig } from './config.ts';

const config = securityConfig();
const pool = createPool();
const redis = createClient({ url: required('REDIS_URL'), disableOfflineQueue: true });
redis.on('error', (error) => console.error('Redis connection error:', error));

await redis.connect();
await pool.query('SELECT 1');
const app = createApp(pool, redis, config);
const server = app.listen(Number(process.env.PORT ?? 4000), process.env.HOST ?? '127.0.0.1', () => {
  console.log('API listening');
});

const shutdown = () => {
  server.close(async () => {
    try {
      await Promise.all([pool.end(), redis.close()]);
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', error);
      process.exit(1);
    }
  });
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
