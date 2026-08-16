import { readFile } from 'node:fs/promises';
import process from 'node:process';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { sql } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { brands, categories, orders, products } from '@bric/db/schema';
import {
  IMPORT_TARGETS,
  parseLegacyImportArgs,
  resolveLegacyImportFiles,
  resolveSelectedTargets,
  type DropScope,
  type ImportTarget,
  type LegacyImportCliOptions,
} from './legacy-mongo-import-script';
import {
  importMongoBrands,
  importMongoCategories,
  mapMongoOrderToCurrentSchema,
  mapMongoProductToCurrentSchemaDetailed,
  parseMongoCollectionExport,
  readMongoId,
  type ImportedBrandRow,
  type ImportedOrderRow,
  type ImportedProductRow,
  type MongoBrandDocument,
  type MongoCategoryDocument,
  type MongoOrderDocument,
  type MongoProductDocument,
} from './mongo-product-import';
import { createSlugAssigner } from '../../lib/slug';

type ValidationReport = {
  targets: ImportTarget[];
  counts: Record<ImportTarget, { loaded: number; prepared: number; skipped: number }>;
  productDiagnostics: {
    priceFallbacks: Array<{ mongoId: string | null; title: string }>;
    oldPriceDropped: number;
    purchasePriceDropped: number;
  };
  orderDiagnostics: {
    archivedCount: number;
    skippedForState: Array<{ mongoId: string | null; state: string | null }>;
    blockedByCart: Array<{ mongoId: string | null; missingRefs: string[] }>;
  };
  notes: string[];
};

type LoadedExports = {
  brands: MongoBrandDocument[];
  categories: MongoCategoryDocument[];
  products: MongoProductDocument[];
  orders: MongoOrderDocument[];
};

type PreparedData = {
  brands: ImportedBrandRow[];
  categories: MongoCategoryDocument[];
  products: MongoProductDocument[];
  orders: MongoOrderDocument[];
  report: ValidationReport;
};

type ExistingLookupMaps = {
  brands: Map<string, number>;
  categories: Map<string, number>;
  products: Map<string, number>;
};

type QueryExecutor = {
  execute: ReturnType<typeof getDb>['execute'];
};

type MutationExecutor = {
  insert: ReturnType<typeof getDb>['insert'];
};

const IMPORT_TARGET_LABELS: Record<ImportTarget, string> = {
  brands: 'brands',
  categories: 'categories',
  products: 'products',
  orders: 'orders',
};

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

  if (options.json) {
    console.log(JSON.stringify(prepared.report, null, 2));
  } else {
    printReport(prepared.report, options, files);
  }

  if (!options.replace) {
    console.log('\nDry run only. No database changes were applied.');
    return;
  }

  if (shouldAbortForBlockedOrders(options, prepared.report)) {
    throw new Error(
      'Refusing to import because some orders reference products that are not available for remapping.',
    );
  }

  const confirmed = await confirmWrite(options, prepared.report);
  if (!confirmed) {
    console.log('Import cancelled.');
    return;
  }

  await db.transaction(async (tx) => {
    const tablesToClear = await resolveTablesToClear(tx, options.dropScope!, selectedTargets);

    if (tablesToClear.length > 0) {
      await tx.execute(sql.raw(buildTruncateSql(tablesToClear)));
    }

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

async function loadExports(files: Record<ImportTarget, string>): Promise<LoadedExports> {
  const [brandInput, categoryInput, productInput, orderInput] = await Promise.all([
    readFile(files.brands, 'utf8'),
    readFile(files.categories, 'utf8'),
    readFile(files.products, 'utf8'),
    readFile(files.orders, 'utf8'),
  ]);

  return {
    brands: parseMongoCollectionExport<MongoBrandDocument>(brandInput),
    categories: parseMongoCollectionExport<MongoCategoryDocument>(categoryInput),
    products: parseMongoCollectionExport<MongoProductDocument>(productInput),
    orders: parseMongoCollectionExport<MongoOrderDocument>(orderInput),
  };
}

async function loadExistingLookups(
  db: ReturnType<typeof getDb>,
  selectedTargets: ImportTarget[],
): Promise<ExistingLookupMaps> {
  const [brandRows, categoryRows, productRows] = await Promise.all([
    selectedTargets.includes('brands')
      ? Promise.resolve([])
      : db.select({ id: brands.id, mongoId: brands.mongoId }).from(brands),
    selectedTargets.includes('categories')
      ? Promise.resolve([])
      : db.select({ id: categories.id, mongoId: categories.mongoId }).from(categories),
    selectedTargets.includes('products')
      ? Promise.resolve([])
      : db.select({ id: products.id, mongoId: products.mongoId }).from(products),
  ]);

  return {
    brands: collectMongoIdMap(brandRows),
    categories: collectMongoIdMap(categoryRows),
    products: collectMongoIdMap(productRows),
  };
}

function prepareImportData(
  loaded: LoadedExports,
  selectedTargets: ImportTarget[],
  existingLookups: ExistingLookupMaps,
): PreparedData {
  const report: ValidationReport = {
    targets: selectedTargets,
    counts: {
      brands: { loaded: loaded.brands.length, prepared: 0, skipped: 0 },
      categories: { loaded: loaded.categories.length, prepared: 0, skipped: 0 },
      products: { loaded: loaded.products.length, prepared: 0, skipped: 0 },
      orders: { loaded: loaded.orders.length, prepared: 0, skipped: 0 },
    },
    productDiagnostics: {
      priceFallbacks: [],
      oldPriceDropped: 0,
      purchasePriceDropped: 0,
    },
    orderDiagnostics: {
      archivedCount: 0,
      skippedForState: [],
      blockedByCart: [],
    },
    notes: [],
  };

  const preparedBrands: ImportedBrandRow[] = [];
  if (selectedTargets.includes('brands')) {
    for (const brand of loaded.brands) {
      const name = typeof brand.name === 'string' ? brand.name.trim() : '';
      if (!name) {
        continue;
      }

      preparedBrands.push({
        mongoId: readMongoId(brand._id),
        name,
        slug: '',
        image: typeof brand.image === 'string' ? brand.image.trim() || null : null,
        isActive: true,
        featured: Boolean(brand.featured),
        createdBy: null,
        createdByName: null,
        updatedBy: null,
        updatedByName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  report.counts.brands.prepared = preparedBrands.length;
  report.counts.brands.skipped = report.counts.brands.loaded - preparedBrands.length;

  const preparedCategories = selectedTargets.includes('categories') ? loaded.categories : [];
  report.counts.categories.prepared = preparedCategories.filter(
    (category) => typeof category.name === 'string' && category.name.trim().length > 0,
  ).length;
  report.counts.categories.skipped =
    report.counts.categories.loaded - report.counts.categories.prepared;

  const availableProductMongoIds = new Set<string>();
  const preparedProducts = selectedTargets.includes('products')
    ? loaded.products.filter((product) => {
        const mapped = mapMongoProductToCurrentSchemaDetailed(product, {
          brandIdByMongoId: selectedTargets.includes('brands') ? undefined : existingLookups.brands,
          categoryIdByMongoId: selectedTargets.includes('categories')
            ? undefined
            : existingLookups.categories,
        });

        if (!mapped) {
          return false;
        }

        if (mapped.row.mongoId) {
          availableProductMongoIds.add(mapped.row.mongoId);
        }

        if (mapped.diagnostics.usedPriceFallback) {
          report.productDiagnostics.priceFallbacks.push({
            mongoId: mapped.row.mongoId,
            title: mapped.row.title,
          });
        }
        if (mapped.diagnostics.oldPriceDropped) {
          report.productDiagnostics.oldPriceDropped += 1;
        }
        if (mapped.diagnostics.purchasePriceDropped) {
          report.productDiagnostics.purchasePriceDropped += 1;
        }

        return true;
      })
    : [];
  report.counts.products.prepared = preparedProducts.length;
  report.counts.products.skipped = report.counts.products.loaded - preparedProducts.length;

  if (!selectedTargets.includes('products')) {
    for (const mongoId of existingLookups.products.keys()) {
      availableProductMongoIds.add(mongoId);
    }
  }

  const validationProductMap = new Map<string, number>();
  let validationProductId = 1;
  for (const mongoId of availableProductMongoIds) {
    validationProductMap.set(mongoId, validationProductId);
    validationProductId += 1;
  }

  const preparedOrders = selectedTargets.includes('orders')
    ? loaded.orders.filter((order) => {
        const result = mapMongoOrderToCurrentSchema(order, {
          productIdByMongoId: selectedTargets.includes('products')
            ? validationProductMap
            : existingLookups.products,
          importNow: new Date(),
        });

        if (!result.row) {
          const unresolvedState = result.warnings.find(
            (warning) => warning.code === 'unresolved_state',
          );
          if (unresolvedState) {
            report.orderDiagnostics.skippedForState.push({
              mongoId: readMongoId(order._id),
              state: unresolvedState.value ?? null,
            });
          }

          const missingRefs = result.errors
            .filter((error) => error.code === 'unmatched_cart_product')
            .map((error) => error.value)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
          if (missingRefs.length > 0) {
            report.orderDiagnostics.blockedByCart.push({
              mongoId: readMongoId(order._id),
              missingRefs,
            });
          }

          return false;
        }

        if (result.row.archivedAt) {
          report.orderDiagnostics.archivedCount += 1;
        }

        return true;
      })
    : [];
  report.counts.orders.prepared = preparedOrders.length;
  report.counts.orders.skipped = report.counts.orders.loaded - preparedOrders.length;

  if (report.productDiagnostics.priceFallbacks.length > 0) {
    report.notes.push(
      `${report.productDiagnostics.priceFallbacks.length} products required a safe price fallback.`,
    );
  }

  if (report.orderDiagnostics.skippedForState.length > 0) {
    report.notes.push(
      `${report.orderDiagnostics.skippedForState.length} orders will be skipped because their wilaya could not be resolved.`,
    );
  }

  if (report.orderDiagnostics.blockedByCart.length > 0) {
    report.notes.push(
      `${report.orderDiagnostics.blockedByCart.length} orders are blocked by unmatched cart product references.`,
    );
  }

  return {
    brands: preparedBrands,
    categories: preparedCategories,
    products: preparedProducts,
    orders: preparedOrders,
    report,
  };
}

async function importProducts(
  tx: MutationExecutor,
  mongoProducts: MongoProductDocument[],
  brandIdByMongoId: Map<string, number>,
  categoryIdByMongoId: Map<string, number>,
) {
  const productIdByMongoId = new Map<string, number>();
  const assignSlug = createSlugAssigner();

  for (const product of mongoProducts) {
    const mapped = mapMongoProductToCurrentSchemaDetailed(product, {
      brandIdByMongoId,
      categoryIdByMongoId,
    });

    if (!mapped) {
      continue;
    }

    const row: ImportedProductRow = {
      ...mapped.row,
      slug: assignSlug(mapped.row.title),
    };

    const [inserted] = await tx.insert(products).values(row).returning({ id: products.id });
    if (row.mongoId) {
      productIdByMongoId.set(row.mongoId, inserted.id);
    }
  }

  return productIdByMongoId;
}

async function importOrders(
  tx: MutationExecutor,
  mongoOrders: MongoOrderDocument[],
  productIdByMongoId: Map<string, number>,
  options: Pick<LegacyImportCliOptions, 'skipBlockedOrders'>,
) {
  const rows: ImportedOrderRow[] = [];
  const batchSize = 500;

  for (const order of mongoOrders) {
    const result = mapMongoOrderToCurrentSchema(order, {
      productIdByMongoId,
      importNow: new Date(),
    });

    if (!result.row) {
      if (options.skipBlockedOrders && hasOnlyBlockedCartRefs(result.errors)) {
        continue;
      }

      if (result.errors.length > 0) {
        throw new Error(
          `Order ${readMongoId(order._id) ?? '<unknown>'} failed validation during write phase.`,
        );
      }

      continue;
    }

    rows.push(result.row);
  }

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    if (batch.length > 0) {
      await tx.insert(orders).values(batch);
    }
  }
}

export function hasOnlyBlockedCartRefs(errors: Array<{ code: string }>) {
  return errors.length > 0 && errors.every((error) => error.code === 'unmatched_cart_product');
}

export function shouldAbortForBlockedOrders(
  options: Pick<LegacyImportCliOptions, 'skipBlockedOrders'>,
  report: Pick<ValidationReport, 'orderDiagnostics'>,
) {
  return !options.skipBlockedOrders && report.orderDiagnostics.blockedByCart.length > 0;
}

async function resolveTablesToClear(
  db: QueryExecutor,
  dropScope: DropScope,
  selectedTargets: ImportTarget[],
) {
  if (dropScope === 'all') {
    const result = await db.execute(sql`
      select table_schema as "schema", table_name as "name"
      from information_schema.tables
      where table_schema in ('public', 'admin')
        and table_type = 'BASE TABLE'
      order by table_schema asc, table_name asc
    `);

    return (result.rows ?? [])
      .map((row: unknown) => row as { schema?: unknown; name?: unknown })
      .filter(
        (row: { schema?: unknown; name?: unknown }): row is { schema: string; name: string } =>
          typeof row.schema === 'string' && typeof row.name === 'string',
      )
      .map(
        (row: { schema: string; name: string }) =>
          `${quoteIdentifier(row.schema)}.${quoteIdentifier(row.name)}`,
      );
  }

  return selectedTargets.map((target) => `${quoteIdentifier('public')}.${quoteIdentifier(target)}`);
}

function collectMongoIdMap(rows: Array<{ id: number; mongoId: string | null }>) {
  const lookup = new Map<string, number>();

  for (const row of rows) {
    if (!row.mongoId) {
      continue;
    }

    lookup.set(row.mongoId, row.id);
  }

  return lookup;
}

function buildTruncateSql(tables: string[]) {
  if (tables.length === 0) {
    throw new Error('No tables selected for truncation.');
  }

  return `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`;
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier "${value}".`);
  }

  return `"${value}"`;
}

async function promptForDropPlan() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const scopeAnswer = await rl.question(
      'Choose destructive scope: [1] all workspace tables, [2] import tables only, [3] custom import tables: ',
    );

    if (scopeAnswer.trim() === '1') {
      return { dropScope: 'all' as const, dropTables: [] as ImportTarget[] };
    }

    if (scopeAnswer.trim() === '2') {
      return { dropScope: 'import' as const, dropTables: [] as ImportTarget[] };
    }

    if (scopeAnswer.trim() !== '3') {
      throw new Error('Invalid destructive scope selection.');
    }

    const tableAnswer = await rl.question(
      `Enter comma-separated import tables (${IMPORT_TARGETS.join(', ')}): `,
    );
    const selected = tableAnswer
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is ImportTarget => IMPORT_TARGETS.includes(value as ImportTarget));

    if (selected.length === 0) {
      throw new Error('Custom destructive scope requires at least one valid import table.');
    }

    return {
      dropScope: 'custom' as const,
      dropTables: [...new Set(selected)],
    };
  } finally {
    rl.close();
  }
}

async function confirmWrite(options: LegacyImportCliOptions, report: ValidationReport) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const scopeDetail =
      options.dropScope === 'custom'
        ? `${options.dropScope} (${options.dropTables.join(', ')})`
        : options.dropScope;
    console.log(`\nWrite summary:`);
    console.log(`- Targets: ${report.targets.join(', ')}`);
    console.log(`- Drop scope: ${scopeDetail}`);
    console.log(
      `- Orders blocked by missing cart refs: ${report.orderDiagnostics.blockedByCart.length}`,
    );
    console.log(`- Skip blocked orders: ${options.skipBlockedOrders ? 'yes' : 'no'}`);

    const answer = await rl.question('Type "yes" to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

function printReport(
  report: ValidationReport,
  options: LegacyImportCliOptions,
  files: Record<ImportTarget, string>,
) {
  console.log('Legacy import sources:');
  for (const target of IMPORT_TARGETS) {
    console.log(`- ${IMPORT_TARGET_LABELS[target]}: ${files[target]}`);
  }

  console.log('\nImport summary:');
  console.log(`- Mode: ${options.replace ? 'write' : 'dry-run'}`);
  console.log(`- Selected targets: ${report.targets.join(', ')}`);
  console.log(`- Skip blocked orders: ${options.skipBlockedOrders ? 'yes' : 'no'}`);
  for (const target of IMPORT_TARGETS) {
    const counts = report.counts[target];
    console.log(
      `- ${IMPORT_TARGET_LABELS[target]}: loaded=${counts.loaded} prepared=${counts.prepared} skipped=${counts.skipped}`,
    );
  }

  console.log('\nDiagnostics:');
  console.log(`- Product price fallbacks: ${report.productDiagnostics.priceFallbacks.length}`);
  console.log(`- Product old prices dropped: ${report.productDiagnostics.oldPriceDropped}`);
  console.log(
    `- Product purchase prices dropped: ${report.productDiagnostics.purchasePriceDropped}`,
  );
  console.log(`- Orders archived by cutoff: ${report.orderDiagnostics.archivedCount}`);
  console.log(
    `- Orders skipped for unresolved state: ${report.orderDiagnostics.skippedForState.length}`,
  );
  console.log(
    `- Orders blocked by unmatched cart refs: ${report.orderDiagnostics.blockedByCart.length}`,
  );

  if (report.productDiagnostics.priceFallbacks.length > 0) {
    console.log('\nProducts with fallback price:');
    for (const item of report.productDiagnostics.priceFallbacks.slice(0, 10)) {
      console.log(`- ${item.title} (${item.mongoId ?? 'no mongo id'})`);
    }
  }

  if (report.orderDiagnostics.skippedForState.length > 0) {
    console.log('\nOrders skipped for unresolved state:');
    for (const item of report.orderDiagnostics.skippedForState.slice(0, 10)) {
      console.log(`- ${item.mongoId ?? 'no mongo id'}: ${item.state ?? '<null>'}`);
    }
  }

  if (report.orderDiagnostics.blockedByCart.length > 0) {
    console.log('\nOrders blocked by unmatched cart refs:');
    for (const item of report.orderDiagnostics.blockedByCart.slice(0, 10)) {
      console.log(`- ${item.mongoId ?? 'no mongo id'}: ${item.missingRefs.join(', ')}`);
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
