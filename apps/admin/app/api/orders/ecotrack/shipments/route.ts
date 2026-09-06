import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  ecotrackShipmentListQuerySchema,
  loadEcotrackOrdersPageData,
} from '../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../lib/auth';
import { OrderSearchTimeoutError } from '../../../../../lib/order-search';
import { getRequestSearchParams } from '../../../../../lib/request';
import { canMutateResource, requireMutationAccess } from '../../../../../lib/rbac';
import {
  captureAdminException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../../lib/sentry';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const session = await auth();
  const writable = canMutateResource(session?.user?.permissions, 'orders');

  if (!hasDb()) {
    return NextResponse.json(
      {
        writable: false,
        items: [],
        pagination: {
          page: 1,
          limit: 25,
          totalItems: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
      { headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const searchParams = getRequestSearchParams(request);
    const parsed = ecotrackShipmentListQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      staleOnly: searchParams.get('staleOnly') ?? undefined,
      sort: searchParams.getAll('sort'),
      sortKey: searchParams.get('sortKey') ?? undefined,
      sortDirection: searchParams.get('sortDirection') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(await loadEcotrackOrdersPageData(parsed.data, writable), {
      headers: withRequestIdHeaders(requestId),
    });
  } catch (error) {
    if (error instanceof OrderSearchTimeoutError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 503,
          headers: withRequestIdHeaders(requestId),
        },
      );
    }
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipments-list',
      route: '/api/orders/ecotrack/shipments',
      session,
    });
    throw error;
  }
}
