import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { deleteManualOrder } from '@/lib/manual-orders';
import { requireAnalyticsAccess } from '@/lib/rbac';
import { triggerAdminReportingRefresh } from '@/lib/reporting-refresh-trigger';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const id = parsePositiveIntegerId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid manual order id' }, { status: 400 });
  }

  const deleted = await deleteManualOrder(id, {
    email: session?.user?.email,
    name: session?.user?.name,
  });
  if (!deleted) {
    return NextResponse.json({ error: 'Manual order not found' }, { status: 404 });
  }

  await triggerAdminReportingRefresh('manual-order-delete');
  return NextResponse.json({ data: deleted });
}
