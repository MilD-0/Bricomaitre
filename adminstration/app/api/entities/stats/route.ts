import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { assetBanners, featuredProductGroups, orders, productCards, products } from '../../../../db/schema';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ products: 0, orders: 0, assets: 0 });
  }
  const [productsCount, ordersCount, bannersCount, groupsCount, cardsCount] = await Promise.all([
    getDb().select({ value: count() }).from(products),
    getDb().select({ value: count() }).from(orders),
    getDb().select({ value: count() }).from(assetBanners),
    getDb().select({ value: count() }).from(featuredProductGroups),
    getDb().select({ value: count() }).from(productCards),
  ]);

  return NextResponse.json({
    products: productsCount[0]?.value ?? 0,
    orders: ordersCount[0]?.value ?? 0,
    assets: (bannersCount[0]?.value ?? 0) + (groupsCount[0]?.value ?? 0) + (cardsCount[0]?.value ?? 0),
  });
}
