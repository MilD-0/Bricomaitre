import { NextResponse } from 'next/server';

import { loadDailyOrderStatusOverview } from '../../../../lib/admin-orders-data';
import { auth } from '../../../../lib/auth';
import { canAccessOrders } from '../../../../lib/navigation-access';
import { normalizePermissions } from '../../../../lib/permissions';

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed || !canAccessOrders(normalizePermissions(session.user.permissions))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ overview: await loadDailyOrderStatusOverview() });
}
