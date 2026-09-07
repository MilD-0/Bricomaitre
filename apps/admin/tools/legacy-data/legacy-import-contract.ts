import { getDb } from '@bric/db/client';
import { type ImportTarget } from './legacy-mongo-import-script';
import {
  type ImportedBrandRow,
  type MongoBrandDocument,
  type MongoCategoryDocument,
  type MongoOrderDocument,
  type MongoProductDocument,
} from './mongo-product-import';

export type ReplacementPlan = {
  tables: string[];
  outsideDependencies: Array<{ table: string; references: string }>;
};

export type ValidationReport = {
  replacement?: ReplacementPlan;
  invalidDocuments: Array<{ target: ImportTarget; mongoId: string | null; reason: string }>;
  targets: ImportTarget[];
  counts: Record<ImportTarget, { loaded: number; prepared: number; skipped: number }>;
  productDiagnostics: {
    priceFallbacks: Array<{ mongoId: string | null; title: string }>;
    oldPriceDropped: number;
    purchasePriceDropped: number;
  };
  orderDiagnostics: {
    invalid: Array<{ mongoId: string | null; reasons: string[]; skippable: boolean }>;
    skippedForState: Array<{ mongoId: string | null; state: string | null }>;
    blockedByCart: Array<{ mongoId: string | null; missingRefs: string[] }>;
  };
  notes: string[];
};

export type LoadedExports = {
  brands: MongoBrandDocument[];
  categories: MongoCategoryDocument[];
  products: MongoProductDocument[];
  orders: MongoOrderDocument[];
};

export type PreparedData = {
  brands: ImportedBrandRow[];
  categories: MongoCategoryDocument[];
  products: MongoProductDocument[];
  orders: MongoOrderDocument[];
  report: ValidationReport;
};

export type ExistingLookupMaps = {
  brands: Map<string, number>;
  categories: Map<string, number>;
  products: Map<string, number>;
};

export type QueryExecutor = {
  execute: ReturnType<typeof getDb>['execute'];
};

export type MutationExecutor = {
  insert: ReturnType<typeof getDb>['insert'];
};

export const IMPORT_TARGET_LABELS: Record<ImportTarget, string> = {
  brands: 'brands',
  categories: 'categories',
  products: 'products',
  orders: 'orders',
};
