import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutOrderError, createCheckoutOrder, verifyCheckoutOrder, verifyCheckoutOrderByToken } from './orders';

const order = {
  id: 42, publicToken: 'public-order-token-1234567890', createdAt: '2026-07-14T10:00:00.000Z', updatedAt: '2026-07-14T10:00:00.000Z',
  firstName: null, lastName: null, fullName: '', email: null, phoneNumber1: '0550000000', phoneNumber2: null,
  cartProducts: ['desk-lamp'], orderProducts: [{ productId: 12, rawValue: 'desk-lamp', title: 'Desk Lamp', unitPrice: 4500, quantity: 1, lineTotal: 4500, thumbnailUrl: null, missing: false }],
  delivery: 0, state: 16, city: 'Alger Centre', homeAddress: null, productSubtotal: 4500, deliveryFee: 500, totalAmount: 5000,
  promoCode: null, promoProductId: null, promoOriginalSubtotal: null, promoDiscountAmount: 0, promoFinalSubtotal: null,
  note: null, confirmed: 0, noAnswerCount: 0, confirmedAt: null, hasStatusHistory: false, statusHistory: [],
};

const payload = {
  firstName: null, lastName: null, email: null, phoneNumber1: '0550000000', phoneNumber2: null,
  cartProducts: ['desk-lamp'], delivery: 0 as const, state: 16, city: 'Alger Centre', homeAddress: null,
  note: null, promoCode: null, visitId: null, journeyId: null, sessionId: null,
};

describe('checkout order client', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('creates an order with an idempotency key and validates its public token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, item: order }), { status: 201 }));
    await expect(createCheckoutOrder(payload, 'attempt-1')).resolves.toEqual(order);
    expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'idempotency-key': 'attempt-1' }), body: JSON.stringify(payload),
    }));
  });

  it('classifies recoverable failures without accepting malformed success responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, item: { id: 42 } }), { status: 200 }));
    await expect(createCheckoutOrder(payload, 'attempt-1')).rejects.toMatchObject({ code: 'unavailable', status: 503 });
    await expect(createCheckoutOrder(payload, 'attempt-2')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('verifies a public order token through the local BFF', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: order }), { status: 200 }));
    await expect(verifyCheckoutOrder(42, 'token with spaces')).resolves.toEqual(order);
    expect(fetch).toHaveBeenCalledWith('/api/orders/42?token=token%20with%20spaces', { headers: { accept: 'application/json' } });
  });

  it('verifies a shareable tracking link without requiring the order ID', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: order }), { status: 200 }));
    await expect(verifyCheckoutOrderByToken('token with spaces')).resolves.toEqual(order);
    expect(fetch).toHaveBeenCalledWith('/api/orders/track/token%20with%20spaces', { headers: { accept: 'application/json' } });
  });

  it('turns network errors into a stable recoverable error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    await expect(createCheckoutOrder(payload, 'attempt-1')).rejects.toBeInstanceOf(CheckoutOrderError);
    await expect(verifyCheckoutOrder(42, 'public-order-token-1234567890')).rejects.toMatchObject({ code: 'network' });
  });
});
