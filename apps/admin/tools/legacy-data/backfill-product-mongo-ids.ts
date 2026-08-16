import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { planProductMongoBackfill, type MongoProductSource } from './product-mongo-backfill';

type ScriptOptions = {
  filePath: string;
  dryRun: boolean;
  overwrite: boolean;
};

function parseArgs(argv: string[]): ScriptOptions {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const filePath = positionals[0];

  if (!filePath) {
    throw new Error(
      'Usage: tsx tools/legacy-data/backfill-product-mongo-ids.ts <mongo-products.json> [--dry-run] [--overwrite]',
    );
  }

  return {
    filePath,
    dryRun: argv.includes('--dry-run'),
    overwrite: argv.includes('--overwrite'),
  };
}

function parseMongoProducts(input: string) {
  const raw = JSON.parse(input) as unknown;
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' &&
        raw !== null &&
        'items' in raw &&
        Array.isArray((raw as { items: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;

  if (!items) {
    throw new Error('Expected a JSON array or an object with an "items" array.');
  }

  return items.flatMap((item): MongoProductSource[] => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const mongoId = '_id' in item ? (item as { _id?: unknown })._id : undefined;
    const title = 'title' in item ? (item as { title?: unknown }).title : undefined;

    if (typeof mongoId !== 'string' || typeof title !== 'string') {
      return [];
    }

    return [{ _id: mongoId, title }];
  });
}

async function main() {
  const { filePath, dryRun, overwrite } = parseArgs(process.argv.slice(2));

  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const mongoProducts = parseMongoProducts(await readFile(filePath, 'utf8'));
  const db = getDb();
  const postgresProducts = await db
    .select({
      id: products.id,
      title: products.title,
      mongoId: products.mongoId,
    })
    .from(products);

  const plan = planProductMongoBackfill(postgresProducts, mongoProducts);
  const updates = plan.matches.filter((match) => overwrite || !match.existingMongoId);
  const skippedExisting = plan.matches.length - updates.length;

  console.log(`Mongo products loaded: ${mongoProducts.length}`);
  console.log(`Postgres products loaded: ${postgresProducts.length}`);
  console.log(`Unique title matches: ${plan.matches.length}`);
  console.log(`Updates to apply: ${updates.length}`);
  console.log(`Skipped because mongo_id already exists: ${skippedExisting}`);
  console.log(`Unmatched Postgres products: ${plan.unmatchedPostgres.length}`);
  console.log(`Unmatched Mongo products: ${plan.unmatchedMongo.length}`);
  console.log(`Duplicate Mongo titles: ${plan.duplicateMongoTitles.length}`);

  if (plan.duplicateMongoTitles.length > 0) {
    console.log('\nDuplicate Mongo titles:');
    for (const duplicate of plan.duplicateMongoTitles.slice(0, 20)) {
      console.log(
        `- ${duplicate.normalizedTitle}: ${duplicate.items.map((item) => item._id).join(', ')}`,
      );
    }
  }

  if (plan.unmatchedPostgres.length > 0) {
    console.log('\nSample unmatched Postgres products:');
    for (const product of plan.unmatchedPostgres.slice(0, 20)) {
      console.log(`- #${product.id}: ${product.title}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run only. No database updates were applied.');
    return;
  }

  await db.transaction(async (tx) => {
    for (const match of updates) {
      await tx
        .update(products)
        .set({
          mongoId: match.mongoId,
          updatedAt: new Date(),
        })
        .where(eq(products.id, match.productId));
    }
  });

  console.log(`\nApplied ${updates.length} mongo_id updates.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
