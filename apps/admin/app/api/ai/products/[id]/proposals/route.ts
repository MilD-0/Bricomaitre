import { NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { listProductContentProposals } from '../../../../../../lib/ai-product-content';
import { requireAiAccess } from '../../../../../../lib/rbac';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAiAccess('ai_catalog_propose');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const productId = Number((await params).id);
  if (!Number.isSafeInteger(productId) || productId <= 0)
    return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });
  return NextResponse.json({ proposals: await listProductContentProposals(productId) });
}
