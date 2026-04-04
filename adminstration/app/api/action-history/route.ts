import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../db/client';
import { actionHistoryQuerySchema, listActionHistory, toActionHistoryItem } from '../../../lib/action-history';
import { requireOpsAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  const query = actionHistoryQuerySchema.parse({
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    search: req.nextUrl.searchParams.get('search') ?? undefined,
    operation: req.nextUrl.searchParams.get('operation') ?? undefined,
    resource: req.nextUrl.searchParams.get('resource') ?? undefined,
    state: req.nextUrl.searchParams.get('state') ?? undefined,
    sortKey: req.nextUrl.searchParams.get('sortKey') ?? undefined,
    sortDirection: req.nextUrl.searchParams.get('sortDirection') ?? undefined,
  });

  if (!hasDb()) {
    return NextResponse.json({
      items: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }

  const result = await listActionHistory(getDb(), query);

  return NextResponse.json({
    items: result.items.map(toActionHistoryItem),
    pagination: result.pagination,
  });
}
