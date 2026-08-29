import { z } from 'zod';

import { searchAssetProductOptions } from './admin-assets-data';
import { loadOrderDetail, loadOrdersPageData } from './admin-orders-data';

export const adminAiProductLookupSchema = z
  .object({
    query: z.string().trim().max(200).default(''),
    productIds: z.array(z.number().int().positive()).max(100).default([]),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .refine((input) => input.query.length > 0 || input.productIds.length > 0, {
    message: 'Provide a search query or at least one product ID.',
  });

export async function findAdminProducts(input: z.input<typeof adminAiProductLookupSchema>) {
  const values = adminAiProductLookupSchema.parse(input);
  return searchAssetProductOptions({
    search: values.query,
    ids: values.productIds,
    page: values.page,
    limit: values.limit,
  });
}

function assistantOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrderDetail>>>) {
  return {
    id: order.id,
    publicToken: order.publicToken,
    ecotrackTrackingNumber: order.ecotrackTrackingNumber,
    variant: order.variant,
    isDegradedCapture: order.isDegradedCapture,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.confirmed,
    noAnswerCount: order.noAnswerCount,
    customer: {
      firstName: order.firstName,
      lastName: order.lastName,
      fullName: order.fullName,
      email: order.email,
      phoneNumber1: order.phoneNumber1,
      phoneNumber2: order.phoneNumber2,
      note: order.note,
    },
    delivery: {
      type: order.delivery,
      state: order.state,
      city: order.city,
      homeAddress: order.homeAddress,
    },
    subtotalOverride: order.subtotalOverride,
    productSubtotal: order.productSubtotal,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    promotion: {
      code: order.promoCode,
      productId: order.promoProductId,
      originalSubtotal: order.promoOriginalSubtotal,
      discountAmount: order.promoDiscountAmount,
      finalSubtotal: order.promoFinalSubtotal,
    },
    products: order.orderProducts.map((product) => ({
      productId: product.productId,
      brandId: product.brandId,
      slug: product.slug,
      rawValue: product.rawValue,
      title: product.title,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      lineTotal: product.lineTotal,
      thumbnailUrl: product.thumbnailUrl,
      missing: product.missing,
    })),
    statusHistory: order.statusHistory.map((entry) => ({
      status: entry.status,
      noAnswerCount: entry.noAnswerCount,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy,
      changedByName: entry.changedByName,
    })),
    confirmedBy: order.confirmedBy,
    confirmedByName: order.confirmedByName,
    confirmedAt: order.confirmedAt,
  };
}

export async function inspectAdminOrders(input: {
  orderIds?: number[];
  status?: number;
  noAnswerCount?: number;
  limit?: number;
}) {
  const orderIds = [...new Set(input.orderIds ?? [])].slice(0, 50);
  if (orderIds.length > 0) {
    const orders = await Promise.all(orderIds.map((id) => loadOrderDetail(id)));
    return {
      items: orders.flatMap((order) => (order ? [assistantOrder(order)] : [])),
      requestedIds: orderIds,
      missingIds: orderIds.filter((id, index) => orders[index] === null),
    };
  }

  const data = await loadOrdersPageData(
    {
      page: 1,
      limit: input.limit ?? 20,
      confirmed: input.status,
      noAnswerCount: input.noAnswerCount,
    },
    false,
  );
  return { items: data.items.map(assistantOrder), pagination: data.pagination };
}
