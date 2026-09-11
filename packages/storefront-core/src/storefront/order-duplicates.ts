import { createHash } from 'node:crypto';

import { and, desc, eq, gte, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { normalizeAlgeriaPhone } from './meta-identity';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const STOREFRONT_ORDER_DUPLICATE_WINDOW_MS = 30_000;

type DuplicateOrderIdentity = {
  phoneNumber1: string;
  normalizedPhone?: string | null;
  cartProducts: string[];
  delivery: number;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
  totalAmount: string | number | null;
};

function normalizeText(value: string | null | undefined) {
  const normalized = value?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
}

function normalizeAmount(value: string | number | null) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

export function buildStorefrontOrderDuplicateFingerprint(input: DuplicateOrderIdentity) {
  const normalizedPhone = input.normalizedPhone ?? normalizeAlgeriaPhone(input.phoneNumber1);
  const cartProducts = input.cartProducts
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  if (!normalizedPhone || cartProducts.length === 0) return null;

  const identity = JSON.stringify({
    normalizedPhone,
    cartProducts,
    delivery: input.delivery,
    state: input.state,
    city: normalizeText(input.city),
    homeAddress: input.delivery === 0 ? normalizeText(input.homeAddress) : null,
    totalAmount: normalizeAmount(input.totalAmount),
  });
  return createHash('sha256').update(identity).digest('hex');
}

export async function findRecentStorefrontDuplicate(
  tx: Transaction,
  input: DuplicateOrderIdentity & { fingerprint: string; now: Date },
) {
  const normalizedPhone = input.normalizedPhone ?? normalizeAlgeriaPhone(input.phoneNumber1);
  if (!normalizedPhone) return null;

  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.fingerprint}, 0))`);
  const candidates = await tx
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.normalizedPhone, normalizedPhone),
        gte(orders.createdAt, new Date(input.now.getTime() - STOREFRONT_ORDER_DUPLICATE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(10)
    .for('update');

  return (
    candidates.find(
      (candidate) =>
        buildStorefrontOrderDuplicateFingerprint({
          phoneNumber1: candidate.phoneNumber1,
          normalizedPhone: candidate.normalizedPhone,
          cartProducts: candidate.cartProducts,
          delivery: candidate.delivery,
          state: candidate.state,
          city: candidate.city,
          homeAddress: candidate.homeAddress,
          totalAmount: candidate.totalAmount,
        }) === input.fingerprint,
    ) ?? null
  );
}
