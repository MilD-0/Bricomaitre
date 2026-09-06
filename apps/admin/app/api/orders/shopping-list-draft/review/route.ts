import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { AdminMutationIdempotencyConflictError } from '../../../../../lib/admin-mutation-idempotency';
import { auth } from '../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../lib/rbac';
import { shoppingListDraftQuerySchema } from '../../../../../lib/shopping-list-drafts';
import { ShoppingListDraftConflictError } from '../../../../../lib/shopping-list-drafts.server';
import {
  loadShoppingListAllocationReview,
  reconcileShoppingListAllocationReview,
  shoppingListAllocationReviewSchema,
  ShoppingListAllocationReviewError,
} from '../../../../../lib/shopping-list-stock-allocations';

export async function GET(request: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = shoppingListDraftQuerySchema.safeParse({
    sourceMode: request.nextUrl.searchParams.get('sourceMode'),
    orderIds: request.nextUrl.searchParams.getAll('orderIds'),
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await loadShoppingListAllocationReview(getDb(), parsed.data));
}

export async function POST(request: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) return denied;
  const productsDenied = await requireMutationAccess('products');
  if (productsDenied) return productsDenied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = shoppingListAllocationReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const session = await auth();
  try {
    return NextResponse.json(
      await reconcileShoppingListAllocationReview(getDb(), parsed.data, {
        email: session?.user?.email,
        name: session?.user?.name,
      }),
    );
  } catch (error) {
    if (
      error instanceof ShoppingListDraftConflictError ||
      error instanceof AdminMutationIdempotencyConflictError
    )
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ShoppingListAllocationReviewError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
