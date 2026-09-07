import { NextResponse } from 'next/server';

import { loadDailyOrderStatusOverview } from '@/lib/admin-orders-data';
import { auth } from '@/lib/auth';
import { canViewProfitStats, hasPermission, normalizePermissions } from '@/lib/permissions';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    !session.user.isAllowed ||
    !hasPermission(normalizePermissions(session.user.permissions), 'orders_write')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const projectionBasisParam = new URL(request.url).searchParams.get('projectionBasis');
  if (
    projectionBasisParam !== null &&
    projectionBasisParam !== 'confirmed' &&
    projectionBasisParam !== 'posted'
  ) {
    return NextResponse.json({ error: 'Invalid projection basis' }, { status: 400 });
  }

  const reportDaysParam = new URL(request.url).searchParams.get('reportDays');
  if (reportDaysParam !== null && !/^[1-7]$/.test(reportDaysParam)) {
    return NextResponse.json({ error: 'Invalid report days' }, { status: 400 });
  }

  const profitProjectionBasis = projectionBasisParam ?? 'confirmed';

  return NextResponse.json({
    overview: await loadDailyOrderStatusOverview({
      includeProfitProjection: canViewProfitStats(normalizePermissions(session.user.permissions)),
      profitProjectionBasis,
      ...(reportDaysParam === null ? {} : { reportDays: Number(reportDaysParam) }),
    }),
  });
}
