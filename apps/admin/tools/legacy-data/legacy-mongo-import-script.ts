import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const IMPORT_TARGETS = ['brands', 'categories', 'products', 'orders'] as const;

export type ImportTarget = (typeof IMPORT_TARGETS)[number];
export type DropScope = 'all' | 'import' | 'custom';

export type LegacyImportCliOptions = {
  dir: string | null;
  brandsPath: string | null;
  categoriesPath: string | null;
  productsPath: string | null;
  ordersPath: string | null;
  skipBlockedOrders: boolean;
  dryRun: boolean;
  replace: boolean;
  json: boolean;
  dropScope: DropScope | null;
  dropTables: ImportTarget[];
};

export type LegacyImportFilePaths = Record<ImportTarget, string>;

export function parseLegacyImportArgs(argv: string[]): LegacyImportCliOptions {
  const dryRun = argv.includes('--dry-run') || !argv.includes('--replace');
  const replace = argv.includes('--replace');
  const dropScope = readOption(argv, '--drop-scope') as DropScope | null;
  const dropTablesOption = readOption(argv, '--drop-tables');

  return {
    dir: readOption(argv, '--dir') ?? findDefaultLegacyImportDir(),
    brandsPath: readOption(argv, '--brands'),
    categoriesPath: readOption(argv, '--categories'),
    productsPath: readOption(argv, '--products'),
    ordersPath: readOption(argv, '--orders'),
    skipBlockedOrders: argv.includes('--skip-blocked-orders'),
    dryRun,
    replace,
    json: argv.includes('--json'),
    dropScope,
    dropTables: parseDropTables(dropTablesOption),
  };
}

export function resolveLegacyImportFiles(options: LegacyImportCliOptions): LegacyImportFilePaths {
  const dir = options.dir ? resolve(options.dir) : null;

  const filePaths = {
    brands: options.brandsPath
      ? resolve(options.brandsPath)
      : dir
        ? resolve(dir, 'mongo-brands.json')
        : null,
    categories: options.categoriesPath
      ? resolve(options.categoriesPath)
      : dir
        ? resolve(dir, 'mongo-categories.json')
        : null,
    products: options.productsPath
      ? resolve(options.productsPath)
      : dir
        ? resolve(dir, 'mongo-products.json')
        : null,
    orders: options.ordersPath
      ? resolve(options.ordersPath)
      : dir
        ? resolve(dir, 'mongo-orders.json')
        : null,
  } satisfies Record<ImportTarget, string | null>;

  const missing = IMPORT_TARGETS.filter((target) => {
    const candidate = filePaths[target];
    return !candidate || !existsSync(candidate);
  });

  if (missing.length > 0) {
    throw new Error(`Missing legacy export files for: ${missing.join(', ')}.`);
  }

  return filePaths as LegacyImportFilePaths;
}

export function resolveSelectedTargets(options: LegacyImportCliOptions) {
  if (!options.replace) {
    return [...IMPORT_TARGETS];
  }

  if (!options.dropScope) {
    throw new Error('A drop scope is required for write mode.');
  }

  if (options.dropScope !== 'custom') {
    return [...IMPORT_TARGETS];
  }

  if (options.dropTables.length === 0) {
    throw new Error('Custom drop scope requires at least one target table.');
  }

  return [...options.dropTables];
}

export function parseDropTables(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  const values = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const invalid = values.filter(
    (value): value is string => !IMPORT_TARGETS.includes(value as ImportTarget),
  );
  if (invalid.length > 0) {
    throw new Error(`Unknown drop tables: ${invalid.join(', ')}.`);
  }

  return [...new Set(values)] as ImportTarget[];
}

export function readOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function findDefaultLegacyImportDir() {
  const candidates = [
    resolve(process.cwd(), 'legacy-mongo-exports'),
    resolve(process.cwd(), '../legacy-mongo-exports'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
