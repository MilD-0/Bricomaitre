import { type OrderProductSummary } from './contract';

export function parseNumericAmount(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getOrderFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  phoneNumber: string,
) {
  const fullName = [firstName, lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return fullName || phoneNumber;
}

export function parseOrderProductId(value: string) {
  const trimmed = value.trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

export function buildOrderProductSummaries(
  cartProducts: string[],
  resolveProduct?: (
    rawValue: string,
    productId: number | null,
  ) => Partial<Omit<OrderProductSummary, 'rawValue' | 'quantity' | 'lineTotal'>> | null | undefined,
) {
  const summaries = new Map<string, OrderProductSummary>();
  const orderedKeys: string[] = [];

  for (const rawProduct of cartProducts) {
    const rawValue = rawProduct.trim();

    if (!rawValue) {
      continue;
    }

    const productId = parseOrderProductId(rawValue);
    const resolved = resolveProduct?.(rawValue, productId) ?? null;
    const key = productId === null ? `raw:${rawValue}` : `product:${productId}`;

    if (!summaries.has(key)) {
      orderedKeys.push(key);
      summaries.set(key, {
        productId: resolved?.productId ?? productId,
        brandId: resolved?.brandId ?? null,
        ...(resolved?.slug !== undefined ? { slug: resolved.slug } : {}),
        rawValue,
        title: resolved?.title ?? rawValue,
        ...(resolved?.titleAr !== undefined ? { titleAr: resolved.titleAr } : {}),
        unitPrice: resolved?.unitPrice ?? 0,
        quantity: 0,
        lineTotal: 0,
        thumbnailUrl: resolved?.thumbnailUrl ?? null,
        missing: resolved?.missing ?? productId !== null,
      });
    }

    const current = summaries.get(key);

    if (!current) {
      continue;
    }

    current.quantity += 1;
    current.lineTotal = current.unitPrice * current.quantity;
  }

  return orderedKeys.map((key) => summaries.get(key)!);
}
