import { desc, isNotNull } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export type ArchivedProduct = {
  id: number;
  title: string;
  sku: string | null;
  barcode: string | null;
  archivedAt: string;
};

export async function loadArchivedProducts(db: Database): Promise<ArchivedProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .where(isNotNull(products.archivedAt))
    .orderBy(desc(products.archivedAt), desc(products.id));

  return rows.flatMap((row) =>
    row.archivedAt ? [{ ...row, archivedAt: row.archivedAt.toISOString() }] : [],
  );
}
