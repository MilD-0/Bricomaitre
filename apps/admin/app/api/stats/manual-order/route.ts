import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { getRequestSearchParams } from '@/lib/request';
import {
  createManualOrder,
  listManualOrders,
  ManualOrderConflictError,
  manualOrderInputSchema,
  manualOrderListQuerySchema,
} from '@/lib/manual-orders';
import { requireAnalyticsAccess } from '@/lib/rbac';
import { triggerAdminReportingRefresh } from '@/lib/reporting-refresh-trigger';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const searchParams = getRequestSearchParams(request);
  const parsed = manualOrderListQuerySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const query = parsed.data;

  return NextResponse.json(await listManualOrders(query));
}

export async function POST(request: NextRequest) {
  const { response: denied, session } = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualOrderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createManualOrder(parsed.data, {
      email: session?.user?.email,
      name: session?.user?.name,
    });
    await triggerAdminReportingRefresh('manual-order-create');
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create manual order' },
      { status: error instanceof ManualOrderConflictError ? 409 : 500 },
    );
  }
}
