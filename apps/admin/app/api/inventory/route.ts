import { NextRequest, NextResponse } from 'next/server';

import { loadInventoryPageData } from '../../../lib/admin-inventory-data';
import { paginationQuerySchema } from '../../../lib/inventory';
import { requireMutationAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  const parsed = paginationQuerySchema.safeParse({
    page: req.nextUrl.searchParams.get('page') ?? '1',
    limit: req.nextUrl.searchParams.get('limit') ?? '50',
    search: req.nextUrl.searchParams.get('search') ?? req.nextUrl.searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await loadInventoryPageData(parsed.data, true));
}
