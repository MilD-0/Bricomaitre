import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';

import { analytics2QuerySchema, getAnalytics2StorefrontDetails } from '../../../../lib/analytics2';
import { requireAnalyticsAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = analytics2QuerySchema.safeParse({
    view: 'storefront',
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    grain: request.nextUrl.searchParams.get('grain') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const details = await getAnalytics2StorefrontDetails(parsed.data);
  return NextResponse.json(details, {
    headers: { 'Cache-Control': 'private, no-cache, must-revalidate' },
  });
}
