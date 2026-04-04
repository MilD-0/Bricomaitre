import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../db/client';
import { loadOrdersPageData } from '../../../lib/admin-orders-data';
import { auth } from '../../../lib/auth';
import { getRequestSearchParams } from '../../../lib/request';
import { canMutateResource, requireMutationAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const session = await auth();
  const writable = canMutateResource(session?.user?.permissions, 'orders');

  if (!hasDb()) {
    return NextResponse.json({
      writable: false,
      items: [],
      pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
  }

  const searchParams = getRequestSearchParams(req);
  return NextResponse.json(await loadOrdersPageData({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    confirmed: searchParams.get('confirmed') ? Number(searchParams.get('confirmed')) : undefined,
    sortKey: searchParams.get('sortKey') ?? undefined,
    sortDirection: searchParams.get('sortDirection') ?? undefined,
  }, writable));
}
