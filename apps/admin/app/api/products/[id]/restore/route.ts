import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import {
  ProductMutationNotFoundError,
  restoreProductThroughCanonicalWorkflow,
} from '../../../../../lib/product-update-workflow';
import { requireMutationAccess } from '../../../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../../../lib/storefront-revalidate';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('products');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const productId = parsePositiveIntegerId((await params).id);
  if (productId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  const db = getDb();

  try {
    await restoreProductThroughCanonicalWorkflow(db, productId, {
      email: session?.user?.email,
      name: session?.user?.name,
    });
  } catch (error) {
    if (error instanceof ProductMutationNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();
  return NextResponse.json({ ok: true });
}
