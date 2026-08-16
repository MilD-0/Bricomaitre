import { expect, type APIRequestContext } from '@playwright/test';

type FixtureOrder = {
  id: number;
  publicToken: string;
};

export async function createFixtureOrder(request: APIRequestContext): Promise<FixtureOrder> {
  const response = await request.post('/api/orders', {
    headers: { 'idempotency-key': `browser-gate-${crypto.randomUUID()}` },
    data: {
      firstName: 'Client',
      lastName: 'Test',
      email: null,
      phoneNumber1: '0550000000',
      phoneNumber2: null,
      cartProducts: ['desk-lamp'],
      delivery: 0,
      state: 16,
      city: 'Alger Centre',
      homeAddress: '12 rue des Outils',
      note: null,
      promoCode: null,
      visitId: null,
      journeyId: null,
      sessionId: null,
    },
  });

  expect(response.status()).toBe(201);
  const body = (await response.json()) as { item: FixtureOrder };
  expect(body.item.id).toBeGreaterThan(0);
  expect(body.item.publicToken).toBeTruthy();
  return body.item;
}
