import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import {
  actionHistoryQuerySchema,
  listActionHistory,
  toActionHistoryListItem,
} from '../../../lib/action-history';
import { requireSettingsAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireSettingsAccess();

  if (denied) {
    return denied;
  }

  const parsed = actionHistoryQuerySchema.safeParse({
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    search: req.nextUrl.searchParams.get('search') ?? undefined,
    operation: req.nextUrl.searchParams.get('operation') ?? undefined,
    resource: req.nextUrl.searchParams.get('resource') ?? undefined,
    state: req.nextUrl.searchParams.get('state') ?? undefined,
    includeEcotrackSync: req.nextUrl.searchParams.get('includeEcotrackSync') ?? undefined,
    sort: req.nextUrl.searchParams.getAll('sort'),
    sortKey: req.nextUrl.searchParams.get('sortKey') ?? undefined,
    sortDirection: req.nextUrl.searchParams.get('sortDirection') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const query = parsed.data;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const result = await listActionHistory(getDb(), query);

  return NextResponse.json({
    items: result.items.map(toActionHistoryListItem),
    pagination: result.pagination,
  });
}
