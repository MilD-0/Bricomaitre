import { inArray, or, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orderLineItems, orders, products } from '@bric/db/schema';
import {
  DEGRADED_CAPTURE_VARIANT,
  buildOrderProductSummaries,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  getOrderFullName,
  isMongoObjectId,
  parseNumericAmount,
  type OrderRecord,
  type OrderStatusHistoryRecord,
} from './orders-support';
import { applyPromoToOrderProducts } from './storefront/promos';

type Database = ReturnType<typeof getDb>;

export type ProductLookupEntry = {
  id: number;
  mongoId: string | null;
  brandId: number | null;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  price: number;
  thumbnailUrl: string | null;
};

export type OrderLineSnapshot = {
  productId: number | null;
  contentId: string;
  rawValue: string;
  title: string;
  effectiveUnitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string | null;
};

export class OrderProductLookup extends Map<string, ProductLookupEntry> {
  readonly orderLinesByOrderId = new Map<number, OrderLineSnapshot[]>();
}

export async function getOrderProductLookup(
  db: Database,
  rows: Array<
    Pick<typeof orders.$inferSelect, 'cartProducts'> &
      Partial<Pick<typeof orders.$inferSelect, 'id'>>
  >,
) {
  const productIds = [
    ...new Set(
      rows
        .flatMap((row) => row.cartProducts ?? [])
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value))
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
  const mongoIds = [
    ...new Set(
      rows
        .flatMap((row) => row.cartProducts ?? [])
        .map((value) => value.trim())
        .filter((value) => isMongoObjectId(value)),
    ),
  ];
  const slugs = [
    ...new Set(
      rows
        .flatMap((row) => row.cartProducts ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && !/^\d+$/.test(value) && !isMongoObjectId(value)),
    ),
  ];

  const orderIds = [
    ...new Set(
      rows
        .map((row) => row.id)
        .filter((value): value is number => Number.isInteger(value) && Number(value) > 0),
    ),
  ];
  const lookup = new OrderProductLookup();

  const productRows =
    productIds.length === 0 && mongoIds.length === 0 && slugs.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            mongoId: products.mongoId,
            brandId: products.brandId,
            slug: products.slug,
            title: products.title,
            titleAr: products.titleAr,
            price: sql<number>`coalesce(${products.price}, 0)::double precision`,
            images: products.images,
          })
          .from(products)
          .where(
            or(
              ...(productIds.length > 0 ? [inArray(products.id, productIds)] : []),
              ...(mongoIds.length > 0 ? [inArray(products.mongoId, mongoIds)] : []),
              ...(slugs.length > 0 ? [inArray(products.slug, slugs)] : []),
            ),
          );

  for (const product of productRows) {
    const entry = {
      id: product.id,
      mongoId: product.mongoId,
      brandId: product.brandId,
      slug: product.slug,
      title: product.title,
      titleAr: product.titleAr,
      price: parseNumericAmount(product.price),
      thumbnailUrl: product.images[0] ?? null,
    };

    lookup.set(`id:${product.id}`, entry);

    if (product.mongoId) {
      lookup.set(`mongo:${product.mongoId}`, entry);
    }
    if (product.slug) {
      lookup.set(`slug:${product.slug}`, entry);
    }
  }

  if (orderIds.length > 0) {
    const lineRows = await db
      .select({
        orderId: orderLineItems.orderId,
        productId: orderLineItems.productId,
        contentId: orderLineItems.contentId,
        rawValue: orderLineItems.rawValue,
        title: orderLineItems.titleSnapshot,
        effectiveUnitPrice: orderLineItems.effectiveUnitPrice,
        quantity: orderLineItems.quantity,
        lineTotal: orderLineItems.lineTotal,
        thumbnailUrl: orderLineItems.thumbnailUrl,
      })
      .from(orderLineItems)
      .where(inArray(orderLineItems.orderId, orderIds));

    for (const line of lineRows) {
      const current = lookup.orderLinesByOrderId.get(line.orderId) ?? [];
      current.push({
        productId: line.productId,
        contentId: line.contentId,
        rawValue: line.rawValue,
        title: line.title,
        effectiveUnitPrice: parseNumericAmount(line.effectiveUnitPrice),
        quantity: line.quantity,
        lineTotal: parseNumericAmount(line.lineTotal),
        thumbnailUrl: line.thumbnailUrl,
      });
      lookup.orderLinesByOrderId.set(line.orderId, current);
    }
  }

  return lookup;
}

export function toOrderRecord(
  row: typeof orders.$inferSelect,
  history: OrderStatusHistoryRecord[] = [],
  productLookup: OrderProductLookup = new OrderProductLookup(),
): OrderRecord {
  const inHouseStatus = coerceOrderStatus(row.inHouseStatus);
  const noAnswerCount = coerceNoAnswerCount(inHouseStatus, row.noAnswerCount, row.inHouseStatus);
  const deliveryFee = parseNumericAmount(row.deliveryFee);
  const subtotalOverride = row.price === null ? null : parseNumericAmount(row.price);
  const snapshotLines = productLookup.orderLinesByOrderId.get(row.id) ?? [];
  const mutableCatalogProducts = buildOrderProductSummaries(
    row.cartProducts ?? [],
    (_rawValue, productId) => {
      const rawValue = _rawValue.trim();
      const lookupKey = isMongoObjectId(rawValue)
        ? `mongo:${rawValue}`
        : productId !== null
          ? `id:${productId}`
          : `slug:${rawValue}`;

      const product = productLookup.get(lookupKey);

      if (!product) {
        return {
          missing: true,
        };
      }

      return {
        productId: product.id,
        brandId: product.brandId,
        ...(product.slug !== null ? { slug: product.slug } : {}),
        title: product.title,
        titleAr: product.titleAr,
        unitPrice: product.price,
        thumbnailUrl: product.thumbnailUrl,
        missing: false,
      };
    },
  );
  const promoDiscountAmount = parseNumericAmount(row.promoDiscountAmount);
  const orderProducts =
    snapshotLines.length > 0
      ? snapshotLines.map((line) => {
          const catalog =
            line.productId == null ? null : (productLookup.get(`id:${line.productId}`) ?? null);
          return {
            productId: line.productId,
            brandId: catalog?.brandId ?? null,
            ...(catalog?.slug != null ? { slug: catalog.slug } : {}),
            rawValue: line.rawValue,
            title: line.title,
            titleAr: catalog?.titleAr ?? null,
            unitPrice: line.effectiveUnitPrice,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
            thumbnailUrl: line.thumbnailUrl,
            missing: false,
          };
        })
      : applyPromoToOrderProducts(mutableCatalogProducts, {
          productId: row.promoProductId,
          discountAmount: promoDiscountAmount,
        });
  const derivedSubtotal = orderProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const persistedSubtotal =
    row.productSubtotal === null ? null : parseNumericAmount(row.productSubtotal);
  const productSubtotal = subtotalOverride ?? persistedSubtotal ?? derivedSubtotal;
  const persistedTotal = row.totalAmount === null ? null : parseNumericAmount(row.totalAmount);
  const totalAmount =
    subtotalOverride === null
      ? (persistedTotal ?? productSubtotal + deliveryFee)
      : productSubtotal + deliveryFee;

  return {
    id: row.id,
    publicToken:
      row.publicTokenExpiresAt && row.publicTokenExpiresAt.getTime() > Date.now()
        ? (row.publicToken ?? null)
        : null,
    ecotrackTrackingNumber: row.ecotrackTrackingNumber ?? null,
    variant: row.variant ?? null,
    isDegradedCapture: row.variant === DEGRADED_CAPTURE_VARIANT,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: getOrderFullName(row.firstName, row.lastName, row.phoneNumber1),
    email: row.email,
    phoneNumber1: row.phoneNumber1,
    phoneNumber2: row.phoneNumber2,
    cartProducts: row.cartProducts ?? [],
    orderProducts,
    delivery: coerceDeliveryType(row.delivery),
    state: row.state,
    city: row.city,
    homeAddress: row.homeAddress,
    subtotalOverride,
    productSubtotal,
    deliveryFee,
    totalAmount,
    promoCode: row.promoCode ?? null,
    promoProductId: row.promoProductId ?? null,
    promoOriginalSubtotal:
      row.promoOriginalSubtotal === null ? null : parseNumericAmount(row.promoOriginalSubtotal),
    promoDiscountAmount,
    promoFinalSubtotal:
      row.promoFinalSubtotal === null ? null : parseNumericAmount(row.promoFinalSubtotal),
    note: row.note,
    inHouseStatus,
    noAnswerCount,
    confirmedBy: row.confirmedBy,
    confirmedByName: row.confirmedByName,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    hasStatusHistory: history.length > 0,
    statusHistory: history,
  };
}

export function toStorefrontOrderRecord(
  row: typeof orders.$inferSelect,
  history: OrderStatusHistoryRecord[] = [],
  productLookup: OrderProductLookup = new OrderProductLookup(),
  purchaseEventId: string | null = null,
) {
  const record = toOrderRecord(row, history, productLookup);

  return {
    id: record.id,
    publicToken: record.publicToken ?? null,
    purchaseEventId,
    variant: record.variant ?? null,
    isDegradedCapture: Boolean(record.isDegradedCapture),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: record.fullName,
    email: record.email ?? null,
    phoneNumber1: record.phoneNumber1,
    phoneNumber2: record.phoneNumber2,
    cartProducts: record.cartProducts,
    orderProducts: record.orderProducts,
    delivery: record.delivery,
    state: record.state,
    city: record.city,
    homeAddress: record.homeAddress,
    subtotalOverride: record.subtotalOverride,
    productSubtotal: record.productSubtotal,
    deliveryFee: record.deliveryFee,
    totalAmount: record.totalAmount,
    promoCode: record.promoCode,
    promoProductId: record.promoProductId,
    promoOriginalSubtotal: record.promoOriginalSubtotal,
    promoDiscountAmount: record.promoDiscountAmount,
    promoFinalSubtotal: record.promoFinalSubtotal,
    note: record.note,
    inHouseStatus: record.inHouseStatus,
    noAnswerCount: record.noAnswerCount,
    confirmedAt: record.confirmedAt,
    hasStatusHistory: record.hasStatusHistory,
    statusHistory: record.statusHistory.map((entry) => ({
      id: entry.id,
      status: entry.status,
      noAnswerCount: entry.noAnswerCount,
      changedAt: entry.changedAt,
    })),
  };
}
