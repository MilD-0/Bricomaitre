import { NextRequest, NextResponse } from 'next/server';

import { searchAssetProductOptions } from '../../../../lib/admin-assets-data';
import { assetProductOptionQuerySchema } from '../../../../lib/assets';
import { requireMutationAccess } from '../../../../lib/rbac';

function parseIds(value: string | null) {
  if (!value) return [];
  return value.split(',').map(Number);
}

export async function GET(request: NextRequest) {
  const { response: denied } = await requireMutationAccess('assets');
  if (denied) return denied;

  const parsed = assetProductOptionQuerySchema.safeParse({
    search: request.nextUrl.searchParams.get('search') ?? '',
    ids: parseIds(request.nextUrl.searchParams.get('ids')),
    page: Number(request.nextUrl.searchParams.get('page') ?? 1),
    limit: Number(request.nextUrl.searchParams.get('limit') ?? 20),
  });
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid product-option query.' }, { status: 400 });

  const result = await searchAssetProductOptions(parsed.data);
  return NextResponse.json({
    ...result,
    hasMore: result.page * result.limit < result.total,
  });
}
