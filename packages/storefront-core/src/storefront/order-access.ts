import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
const PUBLIC_ORDER_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

export function createPublicOrderToken() {
  return `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
}

export function createPublicOrderTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + PUBLIC_ORDER_TOKEN_LIFETIME_MS);
}

export function hasActivePublicToken(
  order: Pick<typeof orders.$inferSelect, 'publicToken' | 'publicTokenExpiresAt' | 'createdAt'>,
  token: string,
  now = new Date(),
) {
  const expiresAt =
    order.publicTokenExpiresAt ??
    new Date(order.createdAt.getTime() + PUBLIC_ORDER_TOKEN_LIFETIME_MS);
  return order.publicToken === token && expiresAt.getTime() > now.getTime();
}

export function readStorefrontOrderToken(options: {
  headerToken?: string | null;
  queryToken?: string | null;
}) {
  return options.headerToken?.trim() || options.queryToken?.trim() || null;
}

export async function requireStorefrontOrderAccess(db: Database, id: number, token: string | null) {
  if (!token) {
    return {
      kind: 'missing_token' as const,
      order: null,
      token: null,
    };
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
  });

  if (!order || !hasActivePublicToken(order, token)) {
    return {
      kind: 'not_found' as const,
      order: null,
      token,
    };
  }

  return {
    kind: 'ok' as const,
    order,
    token,
  };
}

export async function requireStorefrontOrderAccessByToken(db: Database, token: string | null) {
  if (!token) {
    return {
      kind: 'missing_token' as const,
      order: null,
      token: null,
    };
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.publicToken, token),
  });

  if (!order || !hasActivePublicToken(order, token)) {
    return {
      kind: 'not_found' as const,
      order: null,
      token,
    };
  }

  return {
    kind: 'ok' as const,
    order,
    token,
  };
}
