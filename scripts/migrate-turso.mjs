import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error('Missing database environment keys');
const client = createClient({url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN});
try {
  const source = await readFile(new URL('../drizzle/0000_magenta_ken_ellis.sql', import.meta.url), 'utf8');
  const statements = source.split('--> statement-breakpoint').map(sql => sql.trim().replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')).filter(Boolean);
  await client.batch(statements, 'write');
  const result = await client.execute('SELECT count(*) AS count FROM trip_records');
  console.log('Database schema ready; existing records preserved:', result.rows[0].count);
} finally {client.close();}
