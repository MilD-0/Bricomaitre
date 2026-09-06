import { eq, type InferInsertModel } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orderLineItems, orders } from '@bric/db/schema';
import { parseNumericAmount } from './orders-support';

import { resolveOrderLineSnapshots, type MetaCommerceLine } from './storefront/meta';
import {
  resolveOrderPromo,
  resolveProductPromos,
  type ActiveProductPromo,
  type ResolvedOrderPromo,
} from './storefront/promos';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

export type ResolvedOrderCommercialState = {
  cartProducts: string[];
  lines: MetaCommerceLine[];
  promo: ResolvedOrderPromo | null;
  productPromos?: ActiveProductPromo[];
  productSubtotal: number;
  originalProductSubtotal: number;
  discountAmount: number;
};

export class UnorderableCartError extends Error {
  constructor(readonly unresolvedItemCount: number) {
    super('One or more cart products no longer exist or are unavailable.');
    this.name = 'UnorderableCartError';
  }
}

export function assertReviewedOrderPrices(
  commercial: Pick<ResolvedOrderCommercialState, 'promo' | 'productSubtotal' | 'productPromos'>,
  review: {
    promoCode?: string | null;
    productPromos?: Array<{ productId: number; code: string }>;
    expectedProductSubtotal?: number;
  },
) {
  if (
    (review.productPromos?.length
      ? review.productPromos.some(
          (offer) =>
            !commercial.productPromos?.some(
              (accepted) =>
                accepted.productId === offer.productId &&
                accepted.code.toLowerCase() === offer.code.toLowerCase(),
            ),
        )
      : review.promoCode && !commercial.promo) ||
    (review.expectedProductSubtotal !== undefined &&
      Math.abs(review.expectedProductSubtotal - commercial.productSubtotal) > 0.005)
  ) {
    throw new UnorderableCartError(0);
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildCanonicalCartProducts(fallback: string[], lines: MetaCommerceLine[]) {
  if (lines.length === 0) {
    return fallback.map((value) => value.trim()).filter(Boolean);
  }

  return lines.flatMap((line) => Array.from({ length: line.quantity }, () => line.contentId));
}

export async function resolveOrderCommercialState(
  db: Executor,
  input: {
    cartProducts: string[];
    promoCode?: string | null;
    productPromos?: Array<{ productId: number; code: string }>;
    now?: Date;
    requireOrderable?: boolean;
  },
): Promise<ResolvedOrderCommercialState> {
  const explicitOffers = input.productPromos?.length ? input.productPromos : undefined;
  const promo = explicitOffers
    ? null
    : await resolveOrderPromo(db as Database, {
        ...input,
        promoCode: input.promoCode ?? null,
      });
  const productPromos = explicitOffers
    ? await resolveProductPromos(db as Database, { productPromos: explicitOffers, now: input.now })
    : [];
  const lines = await resolveOrderLineSnapshots(db, {
    ...input,
    resolvedPromo: promo,
    resolvedProductPromos: productPromos,
    orderableOnly: input.requireOrderable,
  });
  if (input.requireOrderable) {
    const requestedItemCount = input.cartProducts
      .map((value) => value.trim())
      .filter(Boolean).length;
    const resolvedItemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (requestedItemCount !== resolvedItemCount) {
      throw new UnorderableCartError(requestedItemCount - resolvedItemCount);
    }
  }

  return {
    cartProducts: buildCanonicalCartProducts(input.cartProducts, lines),
    lines,
    promo,
    productPromos: productPromos.filter((offer) =>
      lines.some((line) => line.productId === offer.productId),
    ),
    productSubtotal: roundCurrency(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
    originalProductSubtotal: roundCurrency(
      lines.reduce((sum, line) => sum + line.originalUnitPrice * line.quantity, 0),
    ),
    discountAmount: roundCurrency(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
  };
}

export function buildOrderCommercialValues(
  commercial: ResolvedOrderCommercialState,
  deliveryFee: number,
): Partial<InferInsertModel<typeof orders>> {
  const productSubtotal = commercial.productSubtotal;
  const offers = commercial.productPromos ?? [];
  const singleOffer = offers.length === 1 ? offers[0] : commercial.promo;
  const hasPromo = offers.length > 0 || !!commercial.promo;
  const normalizedDeliveryFee = roundCurrency(Math.max(0, deliveryFee));

  return {
    cartProducts: commercial.cartProducts,
    productSubtotal: productSubtotal.toFixed(2),
    totalAmount: roundCurrency(productSubtotal + normalizedDeliveryFee).toFixed(2),
    promoCode: singleOffer?.code ?? null,
    productPromos: offers.map(({ productId, code }) => ({ productId, code })),
    promoProductId: singleOffer?.productId ?? null,
    promoOriginalSubtotal: hasPromo ? commercial.originalProductSubtotal.toFixed(2) : null,
    promoDiscountAmount: hasPromo ? commercial.discountAmount.toFixed(2) : null,
    promoFinalSubtotal: hasPromo ? productSubtotal.toFixed(2) : null,
  };
}

export async function readOrderProductSubtotal(
  db: Executor,
  order: Pick<typeof orders.$inferSelect, 'id' | 'price' | 'productSubtotal'>,
) {
  if (order.price !== null) {
    return parseNumericAmount(order.price);
  }
  if (order.productSubtotal !== null) {
    return parseNumericAmount(order.productSubtotal);
  }

  const rows = await db
    .select({ lineTotal: orderLineItems.lineTotal })
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, order.id));
  return roundCurrency(rows.reduce((sum, row) => sum + parseNumericAmount(row.lineTotal), 0));
}
