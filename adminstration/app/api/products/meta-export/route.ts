import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { brands, products } from '../../../../db/schema';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
  buildMetaCatalogWorkbook,
  toXlsxBuffer,
} from '../../../../lib/meta-catalog';
import { requireMutationAccess } from '../../../../lib/rbac';

function parseRequestedIds(searchParams: URLSearchParams) {
  const raw = searchParams.getAll('ids');
  const ids = raw
    .flatMap((value) => value.split(','))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(ids)];
}

export async function GET(request: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const ids = parseRequestedIds(request.nextUrl.searchParams);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'At least one product id is required.' }, { status: 400 });
  }

  const db = getDb();
  const [productRows, brandRows] = await Promise.all([
    db.select().from(products).where(inArray(products.id, ids)),
    db.select({ id: brands.id, name: brands.name }).from(brands),
  ]);

  const productsByRequestedOrder = ids
    .map((id) => productRows.find((product) => product.id === id))
    .filter((product): product is typeof productRows[number] => Boolean(product));

  if (productsByRequestedOrder.length === 0) {
    return NextResponse.json({ error: 'No matching products found.' }, { status: 404 });
  }

  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const imageLinkByProductId = new Map<number, string>();

  for (const product of productsByRequestedOrder) {
    const primaryImage = product.images[0];
    if (primaryImage) {
      imageLinkByProductId.set(product.id, primaryImage);
    }
  }

  const rows = buildMetaCatalogExportRows(productsByRequestedOrder, brandNameById, imageLinkByProductId);
  const workbook = buildMetaCatalogWorkbook(rows);
  const buffer = toXlsxBuffer(workbook);
  const fileName = buildMetaCatalogExportFileName();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
