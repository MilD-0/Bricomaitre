import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';

import { analyticsQuerySchema, getAnalyticsStorefrontDetails } from '../../../../lib/analytics';
import { requireAnalyticsAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = analyticsQuerySchema.safeParse({
    view: 'storefront',
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    grain: request.nextUrl.searchParams.get('grain') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const details = await getAnalyticsStorefrontDetails(parsed.data);
  return NextResponse.json(details, {
    headers: { 'Cache-Control': 'private, no-cache, must-revalidate' },
  });
}
