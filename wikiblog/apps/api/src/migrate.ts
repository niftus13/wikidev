import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { databaseOptions } from './config.ts';

const connection = await mysql.createConnection({ ...databaseOptions(), multipleStatements: true });
let locked = false;
try {
  const [lock] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('wikiblog_migrations', 30) AS acquired");
  if (lock[0]?.acquired !== 1) throw new Error('Could not acquire migration lock');
  locked = true;
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = (await readdir(dir)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
  for (const file of files) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT checksum FROM schema_migrations WHERE name = ?', [file]);
    if (rows.length) {
      if (rows[0]?.checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
      continue;
    }
    await connection.query(sql);
    await connection.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, checksum]);
    console.log(`Applied migration: ${file}`);
  }
} finally {
  if (locked) await connection.query("SELECT RELEASE_LOCK('wikiblog_migrations')");
  await connection.end();
}
