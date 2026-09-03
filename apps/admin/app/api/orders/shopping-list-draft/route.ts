import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../lib/auth';
import { requireMutationAccess } from '../../../../lib/rbac';
import {
  shoppingListDraftSaveRequestSchema,
  shoppingListDraftQuerySchema,
} from '../../../../lib/shopping-list-drafts';
import {
  deleteAdminShoppingListDraft,
  loadAdminShoppingListDraft,
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
} from '../../../../lib/shopping-list-drafts.server';

function parseDraftQuery(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  return shoppingListDraftQuerySchema.safeParse({
    sourceMode: searchParams.get('sourceMode') ?? undefined,
    orderIds: searchParams.getAll('orderIds'),
  });
}

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const parsed = parseDraftQuery(req);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({ draft: await loadAdminShoppingListDraft(getDb(), parsed.data) });
}

export async function PUT(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = shoppingListDraftSaveRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await auth();
  try {
    return NextResponse.json({
      ok: true,
      draft: await saveAdminShoppingListDraft(getDb(), parsed.data, {
        email: session?.user?.email,
        name: session?.user?.name,
      }),
    });
  } catch (error) {
    if (error instanceof ShoppingListDraftConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const parsed = parseDraftQuery(req);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  await deleteAdminShoppingListDraft(getDb(), parsed.data);
  return NextResponse.json({ ok: true });
}
