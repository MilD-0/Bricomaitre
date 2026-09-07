import { orders, products } from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { createSlugAssigner } from '../../lib/slug';
import {
  type MutationExecutor,
  type QueryExecutor,
  type ReplacementPlan,
} from './legacy-import-contract';
import {
  type DropScope,
  type ImportTarget,
  type LegacyImportCliOptions,
} from './legacy-mongo-import-script';
import {
  mapMongoOrderToCurrentSchema,
  mapMongoProductToCurrentSchemaDetailed,
  readMongoId,
  type ImportedOrderRow,
  type ImportedProductRow,
  type MongoOrderDocument,
  type MongoProductDocument,
} from './mongo-product-import';

export async function importProducts(
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

export async function importOrders(
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

export async function resolveReplacementPlan(
  db: QueryExecutor,
  dropScope: DropScope,
  selectedTargets: ImportTarget[],
): Promise<ReplacementPlan> {
  const tables = await resolveTablesToClear(db, dropScope, selectedTargets);
  const result = await db.execute(sql`
    with selected as (
      select unnest(${sql.param(tables)}::text[])::regclass as oid
    )
    select format('%I.%I', child_schema.nspname, child.relname) as "table",
      format('%I.%I', parent_schema.nspname, parent.relname) as "references"
    from pg_constraint dependency
    join pg_class child on child.oid = dependency.conrelid
    join pg_namespace child_schema on child_schema.oid = child.relnamespace
    join pg_class parent on parent.oid = dependency.confrelid
    join pg_namespace parent_schema on parent_schema.oid = parent.relnamespace
    where dependency.contype = 'f'
      and dependency.confrelid in (select oid from selected)
      and dependency.conrelid not in (select oid from selected)
    order by 1, 2
  `);
  return {
    tables,
    outsideDependencies: result.rows.map((row) => ({
      table: String(row.table),
      references: String(row.references),
    })),
  };
}

export function collectMongoIdMap(rows: Array<{ id: number; mongoId: string | null }>) {
  const lookup = new Map<string, number>();

  for (const row of rows) {
    if (!row.mongoId) {
      continue;
    }

    lookup.set(row.mongoId, row.id);
  }

  return lookup;
}

export function buildTruncateSql(tables: string[]) {
  if (tables.length === 0) {
    throw new Error('No tables selected for truncation.');
  }

  return `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY RESTRICT`;
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier "${value}".`);
  }

  return `"${value}"`;
}
