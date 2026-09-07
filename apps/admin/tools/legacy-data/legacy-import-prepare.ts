import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { readFile } from 'node:fs/promises';
import {
  type ExistingLookupMaps,
  type LoadedExports,
  type PreparedData,
  type ValidationReport,
} from './legacy-import-contract';
import { collectMongoIdMap, hasOnlyBlockedCartRefs } from './legacy-import-persist';
import { type ImportTarget } from './legacy-mongo-import-script';
import {
  mapMongoBrandToCurrentSchema,
  mapMongoOrderToCurrentSchema,
  mapMongoProductToCurrentSchemaDetailed,
  parseMongoCollectionExport,
  readMongoId,
  type ImportedBrandRow,
  type MongoBrandDocument,
  type MongoCategoryDocument,
  type MongoOrderDocument,
  type MongoProductDocument,
} from './mongo-product-import';

export async function loadExports(files: Record<ImportTarget, string>): Promise<LoadedExports> {
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

export async function loadExistingLookups(
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

export function prepareImportData(
  loaded: LoadedExports,
  selectedTargets: ImportTarget[],
  existingLookups: ExistingLookupMaps,
): PreparedData {
  const report: ValidationReport = {
    targets: selectedTargets,
    invalidDocuments: [],
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
      invalid: [],
      skippedForState: [],
      blockedByCart: [],
    },
    notes: [],
  };

  const preparedBrands: ImportedBrandRow[] = [];
  if (selectedTargets.includes('brands')) {
    for (const brand of loaded.brands) {
      const mapped = mapMongoBrandToCurrentSchema(brand);
      if (!mapped) {
        report.invalidDocuments.push({
          target: 'brands',
          mongoId: readMongoId(brand._id),
          reason: 'Missing brand name.',
        });
        continue;
      }
      preparedBrands.push(mapped);
    }
  }
  report.counts.brands.prepared = preparedBrands.length;
  report.counts.brands.skipped = report.counts.brands.loaded - preparedBrands.length;

  const preparedCategories = selectedTargets.includes('categories') ? loaded.categories : [];
  report.counts.categories.prepared = preparedCategories.filter((category) => {
    if (typeof category.name === 'string' && category.name.trim().length > 0) return true;
    report.invalidDocuments.push({
      target: 'categories',
      mongoId: readMongoId(category._id),
      reason: 'Missing category name.',
    });
    return false;
  }).length;
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
          report.invalidDocuments.push({
            target: 'products',
            mongoId: readMongoId(product._id),
            reason: 'Missing product title.',
          });
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
        });

        if (!result.row) {
          report.orderDiagnostics.invalid.push({
            mongoId: readMongoId(order._id),
            reasons: [...result.errors, ...result.warnings].map((issue) => issue.message),
            skippable: hasOnlyBlockedCartRefs(result.errors) && result.warnings.length === 0,
          });
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
      `${report.orderDiagnostics.skippedForState.length} orders block replacement because their wilaya could not be resolved.`,
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
    // Preserve rejected input until the validated plan explicitly refuses it.
    orders: selectedTargets.includes('orders') ? loaded.orders : [],
    report,
  };
}
