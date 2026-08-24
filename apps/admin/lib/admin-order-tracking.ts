import { createPublicOrderToken } from '@bric/storefront-core/order-access';
import { ensureCanonicalOrderPublicToken } from '@bric/storefront-core/order-write';

import type { getDb } from '@bric/db/client';

type Database = ReturnType<typeof getDb>;

export async function ensureAdminOrderPublicToken(
  db: Database,
  orderId: number,
  candidateToken = createPublicOrderToken(),
) {
  return db.transaction((tx) => ensureCanonicalOrderPublicToken(tx, orderId, candidateToken));
}
