import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { auth } from '../../../../../lib/auth';
import { deleteManualOrder } from '../../../../../lib/stats';
import { requireOpsAccess } from '../../../../../lib/rbac';
import { triggerAdminReportingRefresh } from '../../../../../lib/reporting-refresh-trigger';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOpsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const session = await auth();
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
