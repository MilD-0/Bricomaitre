import { NextResponse } from 'next/server';

import { loadDailyOrderStatusOverview } from '../../../../lib/admin-orders-data';
import { auth } from '../../../../lib/auth';
import { canAccessOrders } from '../../../../lib/navigation-access';
import { canViewProfitStats, normalizePermissions } from '../../../../lib/permissions';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed || !canAccessOrders(normalizePermissions(session.user.permissions))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const projectionBasisParam = new URL(request.url).searchParams.get('projectionBasis');
  if (projectionBasisParam !== null && projectionBasisParam !== 'confirmed' && projectionBasisParam !== 'posted') {
    return NextResponse.json({ error: 'Invalid projection basis' }, { status: 400 });
  }

  const profitProjectionBasis = projectionBasisParam ?? 'confirmed';

  return NextResponse.json({
    overview: await loadDailyOrderStatusOverview({
      includeProfitProjection: canViewProfitStats(session.user.role),
      profitProjectionBasis,
    }),
  });
}
