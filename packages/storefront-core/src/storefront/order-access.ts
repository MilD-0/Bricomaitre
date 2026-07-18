import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import { orders } from '../../../db/src/schema';

type Database = ReturnType<typeof getDb>;

export function createPublicOrderToken() {
  return `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
}

export function readStorefrontOrderToken(options: {
  headerToken?: string | null;
  queryToken?: string | null;
}) {
  return options.headerToken?.trim() || options.queryToken?.trim() || null;
}

export async function requireStorefrontOrderAccess(
  db: Database,
  id: number,
  token: string | null,
) {
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

  if (!order || !order.publicToken || order.publicToken !== token) {
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

export async function requireStorefrontOrderAccessByToken(
  db: Database,
  token: string | null,
) {
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

  if (!order) {
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
