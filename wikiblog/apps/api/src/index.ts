import express from 'express';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const pool = mysql.createPool({
  host: required('MYSQL_HOST'),
  database: required('MYSQL_DATABASE'),
  user: required('MYSQL_USER'),
  password: required('MYSQL_PASSWORD'),
  waitForConnections: true,
  connectionLimit: 10,
});
const redis = createClient({ url: required('REDIS_URL') });
redis.on('error', (error) => console.error('Redis connection error:', error));

await redis.connect();
await pool.query('SELECT 1');

const app = express();
app.get('/api/health', async (_request, response) => {
  try {
    await Promise.all([pool.query('SELECT 1'), redis.ping()]);
    response.json({ status: 'ok', mysql: 'ok', redis: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error);
    response.status(503).json({ status: 'unavailable' });
  }
});

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
