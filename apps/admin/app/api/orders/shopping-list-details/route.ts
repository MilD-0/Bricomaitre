import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { brands, products } from '@bric/db/schema';
import { requireMutationAccess } from '../../../../lib/rbac';

import { MAX_SHOPPING_LIST_ENTRIES } from '../../../../lib/shopping-list-drafts';

const requestSchema = z
  .object({
    productIds: z.array(z.number().int().positive()).max(MAX_SHOPPING_LIST_ENTRIES),
    brandIds: z.array(z.number().int().positive()).max(MAX_SHOPPING_LIST_ENTRIES),
  })
  .strict();

// One bounded lookup replaces a browser request for every product and brand.
export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) return denied;
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const db = getDb();
  const productIds = [...new Set(parsed.data.productIds)];
  const brandIds = [...new Set(parsed.data.brandIds)];
  const [productRows, brandRows] = await Promise.all([
    productIds.length
      ? db
          .select({
            id: products.id,
            inventoryQuantity: products.inventoryQuantity,
            purchasePrice: products.purchasePrice,
          })
          .from(products)
          .where(inArray(products.id, productIds))
      : [],
    brandIds.length
      ? db
          .select({ id: brands.id, name: brands.name })
          .from(brands)
          .where(inArray(brands.id, brandIds))
      : [],
  ]);
  return NextResponse.json({ products: productRows, brands: brandRows });
}
