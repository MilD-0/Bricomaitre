import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { getDb, hasDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import {
  importMongoBrands,
  importMongoCategories,
  mapMongoProductToCurrentSchema,
  parseMongoCollectionExport,
  type MongoBrandDocument,
  type MongoCategoryDocument,
  type MongoProductDocument,
} from './mongo-product-import';
import { createSlugAssigner } from '../../lib/slug';

type ScriptOptions = {
  filePath: string;
  brandsPath: string | null;
  categoriesPath: string | null;
  replace: boolean;
  dryRun: boolean;
};

function logProgress(label: string, current: number, total: number) {
  if (total === 0) {
    return;
  }

  const checkpoints = new Set([1, total]);
  const step = Math.max(1, Math.floor(total / 10));

  for (let value = step; value < total; value += step) {
    checkpoints.add(value);
  }

  if (checkpoints.has(current)) {
    console.log(`${label}: ${current}/${total}`);
  }
}

function summarizeInsertError(error: unknown) {
  if (error instanceof Error) {
    return error.message.split('\n')[0];
  }

  return String(error);
}

function extractDbErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as Record<string, unknown>;
  const cause = (
    candidate.cause && typeof candidate.cause === 'object' ? candidate.cause : candidate
  ) as Record<string, unknown>;

  return {
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : typeof cause.message === 'string'
          ? cause.message
          : null,
    code: typeof cause.code === 'string' ? cause.code : null,
    detail: typeof cause.detail === 'string' ? cause.detail : null,
    constraint: typeof cause.constraint === 'string' ? cause.constraint : null,
    table: typeof cause.table === 'string' ? cause.table : null,
    column: typeof cause.column === 'string' ? cause.column : null,
    schema: typeof cause.schema === 'string' ? cause.schema : null,
    dataType: typeof cause.dataType === 'string' ? cause.dataType : null,
  };
}

function parseArgs(argv: string[]): ScriptOptions {
  const positionals = argv.filter(
    (arg, index) => !arg.startsWith('--') && !argv[index - 1]?.startsWith('--'),
  );
  const filePath = positionals[0];

  if (!filePath) {
    throw new Error(
      'Usage: tsx tools/legacy-data/import-mongo-products.ts <mongo-products.json> [--brands <brands.json>] [--categories <categories.json>] [--replace] [--dry-run]',
    );
  }

  return {
    filePath,
    brandsPath: readOption(argv, '--brands'),
    categoriesPath: readOption(argv, '--categories'),
    replace: argv.includes('--replace'),
    dryRun: argv.includes('--dry-run'),
  };
}

function readOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

async function main() {
  const { filePath, brandsPath, categoriesPath, replace, dryRun } = parseArgs(
    process.argv.slice(2),
  );

  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const [mongoProducts, mongoBrands, mongoCategories] = await Promise.all([
    readFile(filePath, 'utf8').then((input) =>
      parseMongoCollectionExport<MongoProductDocument>(input),
    ),
    brandsPath
      ? readFile(brandsPath, 'utf8').then((input) =>
          parseMongoCollectionExport<MongoBrandDocument>(input),
        )
      : Promise.resolve([]),
    categoriesPath
      ? readFile(categoriesPath, 'utf8').then((input) =>
          parseMongoCollectionExport<MongoCategoryDocument>(input),
        )
      : Promise.resolve([]),
  ]);
  const db = getDb();
  const previewRows = mongoProducts
    .map((product) => mapMongoProductToCurrentSchema(product))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  console.log(`Mongo products loaded: ${mongoProducts.length}`);
  console.log(`Mongo brands loaded: ${mongoBrands.length}`);
  console.log(`Mongo categories loaded: ${mongoCategories.length}`);
  console.log(`Rows ready to import: ${previewRows.length}`);
  console.log(`Skipped because title was missing: ${mongoProducts.length - previewRows.length}`);

  if (!replace) {
    console.log(
      '\nPass --replace to clear the current products, brands, and categories tables before import.',
    );
  }

  if (dryRun) {
    console.log('\nDry run only. No database updates were applied.');
    return;
  }

  if (!replace) {
    throw new Error('Refusing to import without --replace. This script is destructive by design.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(products);
    await tx.delete(categories);
    await tx.delete(brands);

    let importedBrands = 0;
    const brandIdByMongoId = await importMongoBrands(mongoBrands, async (row) => {
      const [inserted] = await tx.insert(brands).values(row).returning({ id: brands.id });
      importedBrands += 1;
      logProgress('Brands imported', importedBrands, mongoBrands.length);
      return inserted.id;
    });
    let importedCategories = 0;
    const categoryIdByMongoId = await importMongoCategories(mongoCategories, async (row) => {
      const [inserted] = await tx.insert(categories).values(row).returning({ id: categories.id });
      importedCategories += 1;
      logProgress('Categories imported', importedCategories, mongoCategories.length);
      return inserted.id;
    });
    const rows = mongoProducts
      .map((product) =>
        mapMongoProductToCurrentSchema(product, {
          brandIdByMongoId,
          categoryIdByMongoId,
        }),
      )
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const assignProductSlug = createSlugAssigner();
    const productRows = rows.map((row) => ({
      ...row,
      slug: assignProductSlug(row.title),
    }));

    if (productRows.length > 0) {
      const chunkSize = 200;

      for (let index = 0; index < productRows.length; index += chunkSize) {
        const chunk = productRows.slice(index, index + chunkSize);
        try {
          await tx.insert(products).values(chunk);
        } catch (error) {
          console.error(
            `Chunk insert failed for products ${index + 1}-${index + chunk.length}: ${summarizeInsertError(error)}`,
          );
          const details = extractDbErrorDetails(error);
          if (details) {
            console.error('Chunk DB error details:');
            console.error(JSON.stringify(details, null, 2));
          }

          throw error;
        }
        logProgress(
          'Products imported',
          Math.min(index + chunk.length, productRows.length),
          productRows.length,
        );
      }
    }

    console.log(`Imported brands: ${brandIdByMongoId.size}`);
    console.log(`Imported categories: ${categoryIdByMongoId.size}`);
    console.log(`Imported products: ${productRows.length}`);
  });

  console.log('\nReplaced products, brands, and categories from Mongo exports.');
  console.log(
    'Note: dependent rows with ON DELETE CASCADE/SET NULL were affected by the replacement.',
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
