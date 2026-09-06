import { describe, expect, it } from 'vitest';

import { getDeliveryTypeLabelKey, getOrderFullName } from '@bric/storefront-core/order-domain';
import {
  buildOrderProductSummaries,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  getOrderStatusLabelKey,
  isConfirmedLifecycleStatus,
  isMongoObjectId,
  ORDER_STATUS,
  orderListQuerySchema,
  orderPatchSchema,
  parseNumericAmount,
  parseOrderProductId,
} from './orders';

describe('lib/orders', () => {
  it('parses a valid order patch payload', () => {
    const parsed = orderPatchSchema.safeParse({
      phoneNumber1: '0550 00 00 00',
      note: ' Call before delivery ',
      inHouseStatus: 2,
      delivery: 1,
      state: '16',
      city: 'Bab Ezzouar',
      homeAddress: ' 12 Main street ',
      cartProducts: ['Chair', 'Desk'],
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.note).toBe('Call before delivery');
      expect(parsed.data.state).toBe(16);
      expect(parsed.data.homeAddress).toBe('12 Main street');
    }
  });

  it('rejects invalid wilaya codes in order patch payloads', () => {
    expect(orderPatchSchema.safeParse({ state: '999' }).success).toBe(false);
    expect(orderPatchSchema.safeParse({ state: 999 }).success).toBe(false);
    expect(orderPatchSchema.safeParse({ state: '16abc' }).success).toBe(false);
    expect(orderPatchSchema.safeParse({ state: '' })).toMatchObject({
      success: true,
      data: { state: null },
    });
  });

  it('rejects empty order patch payloads', () => {
    const parsed = orderPatchSchema.safeParse({});

    expect(parsed.success).toBe(false);
  });

  it('falls back to the phone number when order names are blank', () => {
    expect(getOrderFullName(' ', null, '0550123456')).toBe('0550123456');
    expect(getOrderFullName('Ada', 'Lovelace', '0550123456')).toBe('Ada Lovelace');
  });

  it('converts numeric amounts safely', () => {
    expect(parseNumericAmount('1450.25')).toBe(1450.25);
    expect(parseNumericAmount(null)).toBe(0);
    expect(parseNumericAmount('nope')).toBe(0);
  });

  it('groups repeated cart products into summarized order products', () => {
    expect(
      buildOrderProductSummaries(['12', '12', '7'], (_rawValue, productId) => {
        if (productId === 12) {
          return {
            slug: 'desk',
            title: 'Desk',
            unitPrice: 1500,
            thumbnailUrl: 'https://cdn.example.com/desk.jpg',
            missing: false,
          };
        }

        if (productId === 7) {
          return { title: 'Chair', unitPrice: 800, thumbnailUrl: null, missing: false };
        }

        return null;
      }),
    ).toEqual([
      {
        productId: 12,
        brandId: null,
        slug: 'desk',
        rawValue: '12',
        title: 'Desk',
        unitPrice: 1500,
        quantity: 2,
        lineTotal: 3000,
        thumbnailUrl: 'https://cdn.example.com/desk.jpg',
        missing: false,
      },
      {
        productId: 7,
        brandId: null,
        rawValue: '7',
        title: 'Chair',
        unitPrice: 800,
        quantity: 1,
        lineTotal: 800,
        thumbnailUrl: null,
        missing: false,
      },
    ]);
  });

  it('does not parse Mongo object ids as numeric product ids', () => {
    expect(isMongoObjectId('696b80ad978cdf3fa9f5915a')).toBe(true);
    expect(parseOrderProductId('696b80ad978cdf3fa9f5915a')).toBeNull();
    expect(parseOrderProductId('12chairs')).toBeNull();
    expect(parseOrderProductId('12')).toBe(12);
  });

  it('coerces numeric and legacy order statuses with no-answer counters', () => {
    expect(coerceOrderStatus('yes')).toBe(2);
    expect(coerceOrderStatus('no4')).toBe(1);
    expect(coerceOrderStatus(6)).toBe(6);
    expect(coerceOrderStatus('in_delivery')).toBe(7);
    expect(coerceOrderStatus('returned')).toBe(8);
    expect(coerceOrderStatus('failed')).toBe(9);
    expect(coerceOrderStatus('manual completed')).toBe(10);
    expect(coerceOrderStatus('posted')).toBe(11);
    expect(coerceDeliveryType('home')).toBe(0);
    expect(coerceDeliveryType('office')).toBe(1);
    expect(coerceDeliveryType(1)).toBe(1);
    expect(coerceNoAnswerCount(1, null, 'no3')).toBe(2);
    expect(coerceNoAnswerCount(1, 4, 'no2')).toBe(4);
    expect(coerceNoAnswerCount(2, 4, 'no2')).toBe(0);
    expect(getOrderStatusLabelKey(3)).toBe('dispatched');
    expect(getOrderStatusLabelKey(7)).toBe('inDelivery');
    expect(getOrderStatusLabelKey(8)).toBe('returned');
    expect(getOrderStatusLabelKey(9)).toBe('failed');
    expect(getOrderStatusLabelKey(10)).toBe('manualCompleted');
    expect(getOrderStatusLabelKey(11)).toBe('posted');
    expect(getDeliveryTypeLabelKey(1)).toBe('office');
    expect(isConfirmedLifecycleStatus(5)).toBe(true);
    expect(isConfirmedLifecycleStatus(7)).toBe(true);
    expect(isConfirmedLifecycleStatus(8)).toBe(true);
    expect(isConfirmedLifecycleStatus(9)).toBe(true);
    expect(isConfirmedLifecycleStatus(10)).toBe(true);
    expect(isConfirmedLifecycleStatus(11)).toBe(true);
    expect(isConfirmedLifecycleStatus(6)).toBe(false);
  });

  it('parses paginated order list queries', () => {
    expect(
      orderListQuerySchema.parse({
        page: '3',
        limit: '25',
        search: 'ada',
        noAnswerCount: '2',
        sortKey: 'fullName',
        sortDirection: 'asc',
      }),
    ).toEqual({
      page: 3,
      limit: 25,
      search: 'ada',
      noAnswerCount: 2,
      sort: [],
      sortKey: 'fullName',
      sortDirection: 'asc',
      sortRules: [{ key: 'fullName', direction: 'asc' }],
    });
  });

  it('parses repeated multi-sort order rules', () => {
    expect(
      orderListQuerySchema.parse({
        sort: ['inHouseStatus:asc', 'createdAt:desc'],
      }).sortRules,
    ).toEqual([
      { key: 'inHouseStatus', direction: 'asc' },
      { key: 'createdAt', direction: 'desc' },
    ]);
  });

  it('parses a minimum no-answer count without allowing an exact count too', () => {
    expect(
      orderListQuerySchema.parse({
        inHouseStatus: ORDER_STATUS.NO_ANSWER,
        noAnswerCountMin: '3',
      }).noAnswerCountMin,
    ).toBe(3);

    expect(() =>
      orderListQuerySchema.parse({
        inHouseStatus: ORDER_STATUS.NO_ANSWER,
        noAnswerCount: '2',
        noAnswerCountMin: '3',
      }),
    ).toThrow();
  });
});
