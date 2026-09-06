import { NextRequest, NextResponse } from 'next/server';
import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../lib/rbac';
import {
  applyShoppingListInventory,
  shoppingListInventoryApplySchema,
} from '../../../../../lib/shopping-list-inventory.server';
import { ShoppingListDraftConflictError } from '../../../../../lib/shopping-list-drafts.server';
import { AdminMutationIdempotencyConflictError } from '../../../../../lib/admin-mutation-idempotency';

export async function POST(req: NextRequest) {
  const denied =
    (await requireMutationAccess('orders')) ?? (await requireMutationAccess('products'));
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = shoppingListInventoryApplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const session = await auth();
  try {
    return NextResponse.json(
      await applyShoppingListInventory(getDb(), parsed.data, {
        email: session?.user?.email,
        name: session?.user?.name,
      }),
    );
  } catch (error) {
    if (
      error instanceof ShoppingListDraftConflictError ||
      error instanceof AdminMutationIdempotencyConflictError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
