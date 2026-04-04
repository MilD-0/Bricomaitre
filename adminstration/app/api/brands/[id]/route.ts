import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { brands } from '../../../../db/schema';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  const [brand] = await getDb()
    .select({ id: brands.id, name: brands.name, slug: brands.slug })
    .from(brands)
    .where(eq(brands.id, numericId))
    .limit(1);

  if (!brand) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(brand);
}
