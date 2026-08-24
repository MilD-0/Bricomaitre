import { CanonicalOrderNotFoundError } from '@bric/storefront-core/order-write';
import { z } from 'zod';

import { getDb } from '@bric/db/client';

import { loadOrderDetail } from './admin-orders-data';
import { ensureAdminOrderPublicToken } from './admin-order-tracking';
import { buildOrderTrackingUrl } from './order-tracking-link';

export const adminAiOrderTrackingLinksSchema = z
  .object({
    orderIds: z.array(z.number().int().positive()).min(1).max(50),
  })
  .strict();

export async function issueAdminAiOrderTrackingLinks(
  input: z.input<typeof adminAiOrderTrackingLinksSchema>,
  locale: string,
) {
  const values = adminAiOrderTrackingLinksSchema.parse(input);
  const db = getDb();
  const items = [];
  const failed = [];

  for (const orderId of [...new Set(values.orderIds)]) {
    const order = await loadOrderDetail(orderId);
    if (!order) {
      failed.push({ orderId, reason: 'order_not_found' as const });
      continue;
    }
    try {
      const publicToken = await ensureAdminOrderPublicToken(db, orderId);
      const trackingUrl = buildOrderTrackingUrl(publicToken, locale);
      if (!trackingUrl) {
        failed.push({ orderId, reason: 'tracking_url_unavailable' as const });
        continue;
      }
      items.push({
        orderId,
        customerName: order.fullName,
        action: order.publicToken ? ('existing' as const) : ('issued' as const),
        trackingUrl,
      });
    } catch (error) {
      if (error instanceof CanonicalOrderNotFoundError) {
        failed.push({ orderId, reason: 'order_not_found' as const });
        continue;
      }
      throw error;
    }
  }

  return {
    ok: failed.length === 0,
    locale: locale === 'ar' ? ('ar' as const) : ('fr' as const),
    items,
    failed,
    successCount: items.length,
    failureCount: failed.length,
  };
}
