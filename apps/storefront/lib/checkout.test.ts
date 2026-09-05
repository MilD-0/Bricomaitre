import { describe, expect, it } from 'vitest';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';

import type { CartItem } from './cart';
import {
  buildCheckoutOrderPayload,
  checkoutFormSchema,
  expandCheckoutCart,
  getCheckoutDeliveryFee,
  hasCheckoutStopDesk,
  readCheckoutDraft,
  writeCheckoutDraft,
} from './checkout';

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [
    { communeId: 1, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '16000', hasStopDesk: true },
  ],
  serviceFees: [
    { serviceType: 'livraison', wilayaId: 16, homeFee: '600.00', stopDeskFee: '450.00' },
  ],
  weightFees: [],
  lastSync: null,
};

describe('checkout domain', () => {
  it('keeps the address optional for home and office delivery while validating other fields', () => {
    const form = {
      phoneNumber1: ' 0550 12 34 56 ',
      lastName: '',
      firstName: 'Lina',
      state: '16',
      city: 'Bab Ezzouar',
      homeAddress: '12 rue des Outils',
      email: '',
      delivery: 'home',
    } as const;
    const parsed = checkoutFormSchema.parse(form);
    expect(parsed).toMatchObject({
      phoneNumber1: '0550123456',
      firstName: 'Lina',
      lastName: null,
      state: 16,
      email: null,
    });
    expect(checkoutFormSchema.safeParse({ ...form, phoneNumber1: '', state: 0 }).success).toBe(
      false,
    );
    expect(
      checkoutFormSchema.safeParse({ ...form, phoneNumber1: '1234567890' }).error?.issues[0]
        ?.message,
    ).toBe('phone_invalid');
    expect(
      checkoutFormSchema.parse({ ...form, phoneNumber1: '+213 550 12 34 56' }).phoneNumber1,
    ).toBe('0550123456');
    expect(
      checkoutFormSchema.parse({ ...form, phoneNumber1: '\u200f٠٧٩٨٥٦٤٢٩١' }).phoneNumber1,
    ).toBe('0798564291');
    expect(checkoutFormSchema.safeParse({ ...form, email: 'not-an-email' }).success).toBe(false);
    expect(
      checkoutFormSchema.parse({ ...form, homeAddress: '', delivery: 'home' }).homeAddress,
    ).toBeNull();
    expect(
      checkoutFormSchema.safeParse({ ...form, homeAddress: '', delivery: 'office' }).success,
    ).toBe(true);
  });

  it('stores and validates a reusable checkout draft', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const draft = {
      phoneNumber1: '0774246465',
      lastName: 'Client',
      firstName: '',
      state: 17,
      city: 'Djelfa',
      homeAddress: 'Centre-ville',
      email: '',
      delivery: 'home' as const,
    };

    writeCheckoutDraft(storage, draft);
    expect(readCheckoutDraft(storage)).toEqual(draft);

    values.set('bric:checkout:draft:v1', '{"state":"invalid"}');
    expect(readCheckoutDraft(storage)).toBeNull();
    expect(values.has('bric:checkout:draft:v1')).toBe(false);
  });

  it('calculates home and office delivery from the canonical Ecotrack catalog', () => {
    expect(hasCheckoutStopDesk(catalog, 16)).toBe(true);
    expect(getCheckoutDeliveryFee(catalog, 16, 'home')).toBe(600);
    expect(getCheckoutDeliveryFee(catalog, 16, 'office')).toBe(450);
    expect(getCheckoutDeliveryFee(catalog, null, 'home')).toBe(0);
  });

  it('expands quantities into the canonical order references and builds a PII-bounded payload', () => {
    const items: CartItem[] = [
      {
        productId: 12,
        token: 'desk-lamp',
        title: 'Desk Lamp',
        imageUrl: null,
        unitPrice: 4500,
        quantity: 2,
        availabilityStatus: 'in_stock',
      },
    ];
    expect(expandCheckoutCart(items)).toEqual(['desk-lamp', 'desk-lamp']);
    expect(
      buildCheckoutOrderPayload({
        form: checkoutFormSchema.parse({
          phoneNumber1: '0550123456',
          lastName: '',
          firstName: '',
          state: 16,
          city: 'Bab Ezzouar',
          homeAddress: '',
          email: '',
          delivery: 'office',
        }),
        cartProducts: expandCheckoutCart(items),
        visitId: 'visit-1',
        journeyId: 'journey-1',
        sessionId: 'session-1',
        marketing: {
          semanticsVersion: 'multi_destination_v1',
          eventId: 'purchase-1',
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        },
      }),
    ).toMatchObject({
      delivery: 1,
      state: 16,
      cartProducts: ['desk-lamp', 'desk-lamp'],
      visitId: 'visit-1',
      note: null,
      marketing: { eventId: 'purchase-1' },
      meta: { leadEventId: 'purchase-1' },
    });
  });

  it('requires Meta and multi-destination purchase copies to share identity', () => {
    expect(() =>
      storefrontOrderCreateRequestSchema.parse({
        phoneNumber1: '0550123456',
        cartProducts: ['12'],
        meta: {
          semanticsVersion: 'confirmed_purchase_v1',
          leadEventId: 'meta-event',
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        },
        marketing: {
          semanticsVersion: 'multi_destination_v1',
          eventId: 'different-event',
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        },
      }),
    ).toThrow();
  });
});
