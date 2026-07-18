'use client';

import {
  storefrontCreateOrderResponseSchema,
  storefrontReadOrderResponseSchema,
  type StorefrontOrderCreateRequest,
} from '@bric/storefront-core/contracts';

export class CheckoutOrderError extends Error {
  status: number | null;
  code: 'network' | 'validation' | 'conflict' | 'rate_limit' | 'unavailable' | 'invalid_response' | 'request_failed';

  constructor(message: string, options: { status?: number | null; code: CheckoutOrderError['code'] }) {
    super(message);
    this.name = 'CheckoutOrderError';
    this.status = options.status ?? null;
    this.code = options.code;
  }
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function responseError(response: Response) {
  const code = response.status === 400
    ? 'validation'
    : response.status === 409
      ? 'conflict'
      : response.status === 429
        ? 'rate_limit'
        : response.status >= 500
          ? 'unavailable'
          : 'request_failed';
  return new CheckoutOrderError('order_request_failed', { status: response.status, code });
}

export async function createCheckoutOrder(payload: StorefrontOrderCreateRequest, idempotencyKey: string) {
  let response: Response;
  try {
    response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new CheckoutOrderError('order_network_error', { code: 'network' });
  }
  if (!response.ok) throw responseError(response);
  const parsed = storefrontCreateOrderResponseSchema.safeParse(await readJson(response));
  if (!parsed.success || !parsed.data.item.publicToken) {
    throw new CheckoutOrderError('order_invalid_response', { code: 'invalid_response', status: response.status });
  }
  return parsed.data.item;
}

export async function verifyCheckoutOrder(orderId: number, token: string) {
  let response: Response;
  try {
    response = await fetch(`/api/orders/${orderId}?token=${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new CheckoutOrderError('order_network_error', { code: 'network' });
  }
  if (!response.ok) throw responseError(response);
  const parsed = storefrontReadOrderResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CheckoutOrderError('order_invalid_response', { code: 'invalid_response', status: response.status });
  }
  return parsed.data.item;
}

export async function verifyCheckoutOrderByToken(token: string) {
  let response: Response;
  try {
    response = await fetch(`/api/orders/track/${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new CheckoutOrderError('order_network_error', { code: 'network' });
  }
  if (!response.ok) throw responseError(response);
  const parsed = storefrontReadOrderResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CheckoutOrderError('order_invalid_response', { code: 'invalid_response', status: response.status });
  }
  return parsed.data.item;
}
