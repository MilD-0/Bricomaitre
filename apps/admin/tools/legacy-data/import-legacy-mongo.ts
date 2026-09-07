import { getDb, getPool, hasDb } from '@bric/db/client';
import { brands, categories } from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  buildTruncateSql,
  importOrders,
  importProducts,
  resolveReplacementPlan,
} from './legacy-import-persist';
import { loadExistingLookups, loadExports, prepareImportData } from './legacy-import-prepare';
import { confirmWrite, printReport, promptForDropPlan } from './legacy-import-prompt';
import {
  parseLegacyImportArgs,
  resolveLegacyImportFiles,
  resolveSelectedTargets,
} from './legacy-mongo-import-script';
import { importMongoBrands, importMongoCategories } from './mongo-product-import';

async function main() {
  const options = parseLegacyImportArgs(process.argv.slice(2));

  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const db = getDb();
  const files = resolveLegacyImportFiles(options);
  const loaded = await loadExports(files);

  if (options.replace && !options.dropScope) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Write mode without a TTY requires --drop-scope all|import|custom.');
    }

    const prompted = await promptForDropPlan();
    options.dropScope = prompted.dropScope;
    options.dropTables = prompted.dropTables;
  }

  const selectedTargets = resolveSelectedTargets(options);
  const existingLookups = await loadExistingLookups(db, selectedTargets);
  const prepared = prepareImportData(loaded, selectedTargets, existingLookups);
  const replacement = await resolveReplacementPlan(
    db,
    options.dropScope ?? 'import',
    selectedTargets,
  );
  prepared.report.replacement = replacement;

  if (options.json) {
    console.log(JSON.stringify(prepared.report, null, 2));
  } else {
    printReport(prepared.report, options, files);
  }

  if (!options.replace) {
    console.log('\nDry run only. No database changes were applied.');
    return;
  }

  if (prepared.report.invalidDocuments.length > 0) {
    throw new Error('Refusing to import because selected documents failed validation.');
  }

  if (
    prepared.report.orderDiagnostics.invalid.some(
      (order) => !options.skipBlockedOrders || !order.skippable,
    )
  ) {
    throw new Error('Refusing to import because input orders failed validation.');
  }

  if (replacement.outsideDependencies.length > 0) {
    throw new Error(
      `Refusing to clear tables referenced outside the selected scope: ${replacement.outsideDependencies.map((edge) => `${edge.table} references ${edge.references}`).join('; ')}`,
    );
  }

  const confirmed = await confirmWrite(options, prepared.report);
  if (!confirmed) {
    console.log('Import cancelled.');
    return;
  }

  await db.transaction(async (tx) => {
    // RESTRICT also catches any dependency added after the preview was built.
    await tx.execute(sql.raw(buildTruncateSql(replacement.tables)));

    const brandIdByMongoId = selectedTargets.includes('brands')
      ? await importMongoBrands(
          prepared.brands.map((brand) => ({
            _id: brand.mongoId,
            name: brand.name,
            image: brand.image ?? undefined,
            featured: brand.featured,
            createdAt: brand.createdAt.toISOString(),
            updatedAt: brand.updatedAt.toISOString(),
          })),
          async (row) => {
            const [inserted] = await tx.insert(brands).values(row).returning({ id: brands.id });
            return inserted.id;
          },
        )
      : existingLookups.brands;

    const categoryIdByMongoId = selectedTargets.includes('categories')
      ? await importMongoCategories(prepared.categories, async (row) => {
          const [inserted] = await tx
            .insert(categories)
            .values(row)
            .returning({ id: categories.id });
          return inserted.id;
        })
      : existingLookups.categories;

    const productIdByMongoId = selectedTargets.includes('products')
      ? await importProducts(tx, prepared.products, brandIdByMongoId, categoryIdByMongoId)
      : existingLookups.products;

    if (selectedTargets.includes('orders')) {
      await importOrders(tx, prepared.orders, productIdByMongoId, options);
    }
  });

  console.log('\nLegacy Mongo import completed.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (hasDb()) await getPool().end();
    });
}

export { hasOnlyBlockedCartRefs } from './legacy-import-persist';
