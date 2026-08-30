import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { inArray } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { orders, products } from '@bric/db/schema';
import {
  mapMongoOrderToCurrentSchema,
  parseMongoCollectionExport,
  readMongoId,
  type ImportedOrderRow,
  type MongoOrderDocument,
} from './mongo-product-import';

type Options = {
  ordersPath: string;
  cutoff: Date;
  apply: boolean;
};

const DEFAULT_CUTOFF = new Date('2026-04-03T23:04:39.000Z');
const BATCH_SIZE = 500;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const db = getDb();
  const input = await readFile(options.ordersPath, 'utf8');
  const exportedOrders = parseMongoCollectionExport<MongoOrderDocument>(input);
  const afterCutoff = exportedOrders.filter((order) => {
    const timestamp = readMongoObjectIdTimestamp(readMongoId(order._id));
    return timestamp !== null && timestamp > options.cutoff;
  });

  const mongoIds = afterCutoff
    .map((order) => readMongoId(order._id))
    .filter((value): value is string => Boolean(value));

  const existingMongoIds = await loadExistingOrderMongoIds(db, mongoIds);
  const productIdByMongoId = await loadProductIdByMongoId(db);

  const rows: ImportedOrderRow[] = [];
  const skippedExisting: string[] = [];
  const skippedInvalid: Array<{ mongoId: string | null; reason: string }> = [];

  for (const order of afterCutoff) {
    const mongoId = readMongoId(order._id);

    if (mongoId && existingMongoIds.has(mongoId)) {
      skippedExisting.push(mongoId);
      continue;
    }

    const result = mapMongoOrderToCurrentSchema(order, {
      productIdByMongoId,
    });

    if (!result.row) {
      skippedInvalid.push({
        mongoId,
        reason:
          [
            ...result.errors.map((issue) => issue.code),
            ...result.warnings.map((issue) => issue.code),
          ].join(', ') || 'unmapped',
      });
      continue;
    }

    rows.push(result.row);
  }

  console.log('Missing legacy order backfill summary:');
  console.log(`- Source: ${options.ordersPath}`);
  console.log(`- Cutoff: ${options.cutoff.toISOString()}`);
  console.log(`- Exported orders: ${exportedOrders.length}`);
  console.log(`- After cutoff: ${afterCutoff.length}`);
  console.log(`- Already present: ${skippedExisting.length}`);
  console.log(`- Prepared inserts: ${rows.length}`);
  console.log(`- Skipped invalid: ${skippedInvalid.length}`);

  if (skippedInvalid.length > 0) {
    console.log('\nSample skipped invalid orders:');
    for (const item of skippedInvalid.slice(0, 20)) {
      console.log(`- ${item.mongoId ?? '<missing mongo id>'}: ${item.reason}`);
    }
  }

  if (!options.apply) {
    console.log('\nDry run only. Pass --apply to insert rows.');
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(orders).values(batch);
    }
  }

  console.log(`\nInserted ${rows.length} missing legacy orders.`);
}

async function loadExistingOrderMongoIds(db: ReturnType<typeof getDb>, mongoIds: string[]) {
  const existing = new Set<string>();

  for (let index = 0; index < mongoIds.length; index += BATCH_SIZE) {
    const batch = mongoIds.slice(index, index + BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }

    const rows = await db
      .select({ mongoId: orders.mongoId })
      .from(orders)
      .where(inArray(orders.mongoId, batch));

    for (const row of rows) {
      if (row.mongoId) {
        existing.add(row.mongoId);
      }
    }
  }

  return existing;
}

async function loadProductIdByMongoId(db: ReturnType<typeof getDb>) {
  const rows = await db.select({ id: products.id, mongoId: products.mongoId }).from(products);
  const lookup = new Map<string, number>();

  for (const row of rows) {
    if (row.mongoId) {
      lookup.set(row.mongoId, row.id);
    }
  }

  return lookup;
}

function readMongoObjectIdTimestamp(mongoId: string | null) {
  if (!mongoId || !/^[0-9a-fA-F]{24}$/.test(mongoId)) {
    return null;
  }

  return new Date(Number.parseInt(mongoId.slice(0, 8), 16) * 1000);
}

function parseArgs(argv: string[]): Options {
  const ordersPath = readOption(argv, '--orders') ?? 'mongo-orders.json';
  const cutoffRaw = readOption(argv, '--cutoff');
  const cutoff = cutoffRaw ? new Date(cutoffRaw) : DEFAULT_CUTOFF;

  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`Invalid --cutoff value: ${cutoffRaw}`);
  }

  return {
    ordersPath,
    cutoff,
    apply: argv.includes('--apply'),
  };
}

function readOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
