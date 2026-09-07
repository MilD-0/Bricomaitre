import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { requireMutationAccess } from '@/lib/rbac';
import { shoppingListDraftQuerySchema } from '@/lib/shopping-list-drafts';
import { loadShoppingListAllocationReview } from '@/lib/shopping-list-stock-allocations';

export async function POST(request: NextRequest) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = shoppingListDraftQuerySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await loadShoppingListAllocationReview(getDb(), parsed.data));
}
