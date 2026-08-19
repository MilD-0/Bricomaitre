import { and, ne, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class ProductIntegrityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductIntegrityConflictError';
  }
}

export async function lockProductIdentifierWrites(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('product-identifiers'))`);
}

export async function assertUniqueProductIdentifiers<T extends object>(
  tx: Transaction,
  values: T,
  currentProductId?: number,
) {
  const identifierValues = values as { sku?: string | null; barcode?: string | null };
  if (!('sku' in values) && !('barcode' in values)) return;
  if (!identifierValues.sku?.trim() && !identifierValues.barcode?.trim()) return;
  await lockProductIdentifierWrites(tx);
  for (const field of ['sku', 'barcode'] as const) {
    if (!(field in values)) continue;
    const value = identifierValues[field]?.trim();
    if (!value) continue;
    const column = field === 'sku' ? products.sku : products.barcode;
    const filters = [sql`lower(btrim(${column})) = lower(btrim(${value}))`];
    if (currentProductId) filters.push(ne(products.id, currentProductId));
    const [duplicate] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(...filters))
      .limit(1);
    if (duplicate) {
      throw new ProductIntegrityConflictError(
        `${field === 'sku' ? 'SKU' : 'Barcode'} is already assigned to product #${duplicate.id}.`,
      );
    }
  }
}
