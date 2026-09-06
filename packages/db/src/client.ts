import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

export function createDb(options: { max: number; application_name?: string; options?: string }) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize Drizzle.');
  }
  return drizzle(new Pool({ ...options, connectionString }), { schema });
}

let pool: InstanceType<typeof Pool> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (connectionString) {
  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });
}

export function getDb() {
  if (!db) {
    throw new Error('DATABASE_URL is required to initialize Drizzle.');
  }
  return db;
}

export function getPool() {
  if (!pool) {
    throw new Error('DATABASE_URL is required to initialize pool.');
  }
  return pool;
}

export function hasDb() {
  return Boolean(db);
}
