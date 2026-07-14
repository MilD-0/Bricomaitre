import { describe, expect, it } from 'vitest';

import type { CartItem } from './cart';
import {
  buildCheckoutOrderPayload,
  checkoutFormSchema,
  expandCheckoutCart,
  getCheckoutDeliveryFee,
  hasCheckoutStopDesk,
} from './checkout';

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [{ communeId: 1, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '16000', hasStopDesk: true }],
  serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '600.00', stopDeskFee: '450.00' }],
  weightFees: [],
  lastSync: null,
};

describe('checkout domain', () => {
  it('validates the legacy storefront fields while keeping optional details optional', () => {
    const parsed = checkoutFormSchema.parse({
      phoneNumber1: ' 0550 12 34 56 ',
      lastName: '',
      firstName: 'Lina',
      state: '16',
      city: 'Bab Ezzouar',
      homeAddress: '',
      email: '',
      delivery: 'home',
    });
    expect(parsed).toMatchObject({ phoneNumber1: '0550 12 34 56', firstName: 'Lina', lastName: null, state: 16, email: null });
    expect(checkoutFormSchema.safeParse({ ...parsed, phoneNumber1: '', state: 0 }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...parsed, email: 'not-an-email' }).success).toBe(false);
  });

  it('calculates home and office delivery from the canonical Ecotrack catalog', () => {
    expect(hasCheckoutStopDesk(catalog, 16)).toBe(true);
    expect(getCheckoutDeliveryFee(catalog, 16, 'home')).toBe(600);
    expect(getCheckoutDeliveryFee(catalog, 16, 'office')).toBe(450);
    expect(getCheckoutDeliveryFee(catalog, null, 'home')).toBe(0);
  });

  it('expands quantities into the canonical order references and builds a PII-bounded payload', () => {
    const items: CartItem[] = [{
      productId: 12,
      token: 'desk-lamp',
      title: 'Desk Lamp',
      imageUrl: null,
      unitPrice: 4500,
      quantity: 2,
      availabilityStatus: 'in_stock',
    }];
    expect(expandCheckoutCart(items)).toEqual(['desk-lamp', 'desk-lamp']);
    expect(buildCheckoutOrderPayload({
      form: checkoutFormSchema.parse({
        phoneNumber1: '0550123456', lastName: '', firstName: '', state: 16,
        city: 'Bab Ezzouar', homeAddress: '', email: '', delivery: 'office',
      }),
      cartProducts: expandCheckoutCart(items),
      journeyId: 'journey-1',
      sessionId: 'session-1',
    })).toMatchObject({ delivery: 1, state: 16, cartProducts: ['desk-lamp', 'desk-lamp'], note: null });
  });
});
