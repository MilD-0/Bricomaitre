import { NextRequest, NextResponse } from 'next/server';

import { loadInventoryPageData } from '../../../lib/admin-inventory-data';
import { inventoryQuerySchema, inventorySortKeys } from '../../../lib/inventory';
import { parseSortRuleStrings } from '../../../lib/multi-sort';
import { requireMutationAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  const sort = parseSortRuleStrings(req.nextUrl.searchParams.getAll('sort'), inventorySortKeys);
  if (!sort.ok) return NextResponse.json({ error: sort.issue }, { status: 400 });
  const parsed = inventoryQuerySchema.safeParse({
    sort: sort.rules.length ? sort.rules : undefined,
    page: req.nextUrl.searchParams.get('page') ?? '1',
    limit: req.nextUrl.searchParams.get('limit') ?? '50',
    search: req.nextUrl.searchParams.get('search') ?? req.nextUrl.searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await loadInventoryPageData(parsed.data, true));
}
