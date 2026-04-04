import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../db/schema';
import { baselineDbMigrations } from '../lib/db-baseline';

function readThroughTag(argv: string[]) {
  const index = argv.indexOf('--through');
  return index === -1 ? null : argv[index + 1] ?? null;
}

async function main() {
  const throughTag = readThroughTag(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;

  if (!throughTag) {
    throw new Error('Usage: pnpm db:baseline --through <migration_tag>');
  }

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString });

  try {
    console.warn(
      `Baselining migrations through ${throughTag}. Use this only once for a pre-existing database; do not use it for normal forward migrations.`,
    );
    const db = drizzle(pool, { schema });
    const records = await baselineDbMigrations(db, throughTag);
    console.log(`Baselined ${records.length} migrations through ${throughTag}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
