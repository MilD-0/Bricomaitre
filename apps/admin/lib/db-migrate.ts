import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { getDb } from '@bric/db/client';
import {
  backfillOrderCommercialSnapshots,
  backfillOrderNormalizedPhones,
} from './order-commercial-backfill';

type Database = ReturnType<typeof getDb>;

export function resolveMigrationFolder(cwd = process.cwd()) {
  return resolve(cwd, 'drizzle/migrations');
}

export function resolveBootstrapMigrationFolder(cwd = process.cwd()) {
  return resolve(cwd, 'drizzle/bootstrap');
}

async function hasApplicationTables(db: Database) {
  const result = await db.execute(sql`
    select exists (
      select 1
      from pg_catalog.pg_tables
      where schemaname in ('public', 'admin')
    ) as "hasApplicationTables"
  `);
  return Boolean(
    (result.rows[0] as { hasApplicationTables?: boolean } | undefined)?.hasApplicationTables,
  );
}

type ProductIdentifierConflict = {
  field: 'sku' | 'barcode';
  value: string;
  productIds: number[];
};

async function hasProductsTable(db: Database) {
  const result = await db.execute(sql`
    select to_regclass('public.products') is not null as "hasProductsTable"
  `);
  return Boolean((result.rows[0] as { hasProductsTable?: boolean } | undefined)?.hasProductsTable);
}

export async function findProductIdentifierConflicts(
  db: Database,
): Promise<ProductIdentifierConflict[]> {
  if (!(await hasProductsTable(db))) return [];

  const result = await db.execute(sql`
    select 'sku'::text as field,
           lower(btrim(sku)) as value,
           array_agg(id order by id) as "productIds"
    from products
    where nullif(btrim(sku), '') is not null
    group by lower(btrim(sku))
    having count(*) > 1
    union all
    select 'barcode'::text as field,
           lower(btrim(barcode)) as value,
           array_agg(id order by id) as "productIds"
    from products
    where nullif(btrim(barcode), '') is not null
    group by lower(btrim(barcode))
    having count(*) > 1
    order by field, value
    limit 50
  `);

  return result.rows.map((row: unknown) => {
    const conflict = row as Record<string, unknown>;
    return {
      field: conflict.field === 'barcode' ? 'barcode' : 'sku',
      value: String(conflict.value),
      productIds: Array.isArray(conflict.productIds) ? conflict.productIds.map(Number) : [],
    };
  });
}

export async function assertProductIdentifiersReadyForMigrations(db: Database) {
  const conflicts = await findProductIdentifierConflicts(db);
  if (conflicts.length === 0) return;

  const details = conflicts
    .map(
      (conflict) =>
        `${conflict.field.toUpperCase()} "${conflict.value}" on products ${conflict.productIds.join(', ')}`,
    )
    .join('; ');
  throw new Error(
    `Duplicate product identifiers must be resolved before migrations can enforce uniqueness: ${details}. Clear each duplicate SKU or barcode from all but its intended owner, then retry the migration.`,
  );
}

export async function runDbMigrations(
  db: Database,
  options: {
    cwd?: string;
  } = {},
) {
  const migrationsFolder = resolveMigrationFolder(options.cwd);
  const bootstrapMigrationsFolder = resolveBootstrapMigrationFolder(options.cwd);
  const useBootstrap = !(await hasApplicationTables(db));

  if (useBootstrap) {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await migrate(db, {
      migrationsFolder: bootstrapMigrationsFolder,
    });
  } else {
    await assertProductIdentifiersReadyForMigrations(db);
  }

  await migrate(db, {
    migrationsFolder,
  });

  const commercialBackfill = await backfillOrderCommercialSnapshots(db);
  if (commercialBackfill.unresolvedOrderIds.length > 0) {
    throw new Error(
      `Order commercial snapshot backfill could not resolve every product for orders: ${commercialBackfill.unresolvedOrderIds.join(', ')}. Restore or correct those catalog references, then rerun migrations before deploying the application.`,
    );
  }
  const phoneBackfill = await backfillOrderNormalizedPhones(db);

  return {
    migrationsFolder,
    bootstrapMigrationsFolder,
    usedBootstrap: useBootstrap,
    commercialBackfill,
    phoneBackfill,
  };
}
