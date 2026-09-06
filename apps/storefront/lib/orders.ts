'use client';

import {
  storefrontCreateOrderResponseSchema,
  storefrontReadOrderResponseSchema,
  type StorefrontOrderCreateRequest,
} from '@bric/storefront-core/contracts';

import { withCheckoutRequestTimeout } from './checkout-request';

export class CheckoutOrderError extends Error {
  status: number | null;
  retryAfterSeconds: number | null;
  code:
    | 'network'
    | 'validation'
    | 'conflict'
    | 'cart_changed'
    | 'rate_limit'
    | 'unavailable'
    | 'invalid_response'
    | 'request_failed';

  constructor(
    message: string,
    options: {
      status?: number | null;
      code: CheckoutOrderError['code'];
      retryAfterSeconds?: number | null;
    },
  ) {
    super(message);
    this.name = 'CheckoutOrderError';
    this.status = options.status ?? null;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function responseError(response: Response) {
  const body = await readJson(response);
  const code =
    response.status === 409 &&
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    body.code === 'cart_changed'
      ? 'cart_changed'
      : response.status === 400
        ? 'validation'
        : response.status === 409
          ? 'conflict'
          : response.status === 429
            ? 'rate_limit'
            : response.status >= 500
              ? 'unavailable'
              : 'request_failed';
  const retryHeader = response.headers.get('retry-after');
  const delay =
    retryHeader === null
      ? NaN
      : /^\d+$/.test(retryHeader)
        ? Number(retryHeader)
        : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000);
  return new CheckoutOrderError('order_request_failed', {
    status: response.status,
    code,
    retryAfterSeconds: Number.isFinite(delay) ? Math.max(0, delay) : null,
  });
}

export async function createCheckoutOrder(
  payload: StorefrontOrderCreateRequest,
  idempotencyKey: string,
) {
  return withCheckoutRequestTimeout(async (signal) => {
    let response: Response;
    try {
      response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      throw new CheckoutOrderError('order_network_error', { code: 'network' });
    }
    if (!response.ok) throw await responseError(response);
    const parsed = storefrontCreateOrderResponseSchema.safeParse(await readJson(response));
    if (!parsed.success || !parsed.data.item.publicToken) {
      throw new CheckoutOrderError('order_invalid_response', {
        code: 'invalid_response',
        status: response.status,
      });
    }
    return parsed.data.item;
  });
}

export async function verifyCheckoutOrder(orderId: number, token: string) {
  let response: Response;
  try {
    response = await fetch(`/api/orders/${orderId}`, {
      headers: { accept: 'application/json', 'x-order-token': token },
    });
  } catch {
    throw new CheckoutOrderError('order_network_error', { code: 'network' });
  }
  if (!response.ok) throw await responseError(response);
  const parsed = storefrontReadOrderResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CheckoutOrderError('order_invalid_response', {
      code: 'invalid_response',
      status: response.status,
    });
  }
  return parsed.data.item;
}

export async function verifyCheckoutOrderByToken(token: string) {
  let response: Response;
  try {
    response = await fetch('/api/orders/track', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new CheckoutOrderError('order_network_error', { code: 'network' });
  }
  if (!response.ok) throw await responseError(response);
  const parsed = storefrontReadOrderResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CheckoutOrderError('order_invalid_response', {
      code: 'invalid_response',
      status: response.status,
    });
  }
  return parsed.data.item;
}
