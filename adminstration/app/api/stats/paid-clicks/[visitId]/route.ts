import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../../db/client';
import { getPaidClickVisitDetail } from '../../../../../lib/paid-clicks';
import { requireDeveloperAccess } from '../../../../../lib/rbac';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ visitId: string }> },
) {
  const denied = await requireDeveloperAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { visitId } = await context.params;
  const item = await getPaidClickVisitDetail(visitId);
  if (!item) {
    return NextResponse.json({ error: 'Paid click visit not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}
