import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutOrderError } from '@/lib/orders';
import { CheckoutForm } from './checkout-form';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  track: vi.fn(),
  identity: vi.fn(() => ({ visitId: 'visit-1', journeyId: 'journey-1', sessionId: 'session-1' })),
  haptic: vi.fn(),
  iconStart: vi.fn(),
  iconStop: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return { ...actual, createCheckoutOrder: mocks.create };
});
vi.mock('@/lib/cart', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cart')>('@/lib/cart');
  return {
    ...actual,
    reconcileCartWithCatalog: mocks.reconcile,
  };
});
vi.mock('@/lib/analytics', () => ({
  getAnalyticsIdentity: mocks.identity,
  trackCheckoutEvent: mocks.track,
  trackProductEvent: vi.fn(),
}));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: vi.fn(), triggerHaptic: mocks.haptic }));
vi.mock('@/components/storefront-image', () => ({
  StorefrontImage: ({ src }: { src: string }) => <span data-image-src={src} />,
}));
vi.mock('@/components/ui/shield-check', async () => {
  const React = await import('react');
  const ShieldCheckIcon = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      startAnimation: mocks.iconStart,
      stopAnimation: mocks.iconStop,
    }));
    return <svg data-testid="animated-shield" />;
  });
  ShieldCheckIcon.displayName = 'MockShieldCheckIcon';
  return { ShieldCheckIcon };
});

const labelKeys = [
  'title',
  'description',
  'phone',
  'phonePlaceholder',
  'phoneError',
  'lastName',
  'firstName',
  'wilaya',
  'commune',
  'address',
  'email',
  'optional',
  'deliveryMode',
  'homeDelivery',
  'officeDelivery',
  'officeUnavailable',
  'orderSummary',
  'subtotal',
  'delivery',
  'total',
  'quantity',
  'submit',
  'submitting',
  'emptyTitle',
  'emptyBody',
  'browseProducts',
  'requiredError',
  'emailError',
  'submitError',
  'cartUpdated',
  'quantityLimit',
  'editCart',
  'rateLimit',
  'retry',
  'savedAttempt',
  'trustPhone',
  'trustPayment',
  'trustDelivery',
] as const;
const labels: ComponentProps<typeof CheckoutForm>['labels'] = Object.fromEntries(
  labelKeys.map((key) => [key, key]),
) as Record<(typeof labelKeys)[number], string>;

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [
    { communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true },
  ],
  serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' }],
  weightFees: [],
  lastSync: null,
};

const directItem = {
  productId: 12,
  token: 'desk-lamp',
  title: 'Desk Lamp',
  imageUrl: null,
  unitPrice: 4500,
  quantity: 2,
  availabilityStatus: 'in_stock',
};
const support = {
  contact: {
    phoneDisplay: '0795 34 28 26',
    phoneHref: 'tel:+213795342826',
    phoneEnabled: true,
    aiAssistantEnabled: true,
  },
  labels: { title: 'Need help?', description: 'Call us.', call: 'Call' },
};
const order = {
  id: 42,
  publicToken: 'public-order-token-1234567890',
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
  firstName: 'Ada',
  lastName: null,
  fullName: 'Ada',
  email: null,
  phoneNumber1: '0550000000',
  phoneNumber2: null,
  cartProducts: ['12', '12'],
  orderProducts: [
    {
      productId: 12,
      rawValue: 'desk-lamp',
      title: 'Desk Lamp',
      unitPrice: 4500,
      quantity: 2,
      lineTotal: 9000,
      thumbnailUrl: null,
      missing: false,
    },
  ],
  delivery: 0,
  state: 16,
  city: 'Alger Centre',
  homeAddress: null,
  productSubtotal: 9000,
  deliveryFee: 500,
  totalAmount: 9500,
  promoCode: null,
  promoProductId: null,
  promoOriginalSubtotal: null,
  promoDiscountAmount: 0,
  promoFinalSubtotal: null,
  note: null,
  inHouseStatus: 0,
  noAnswerCount: 0,
  confirmedAt: null,
  hasStatusHistory: false,
  statusHistory: [],
};

describe('CheckoutForm', () => {
  it('replays a legacy pending request without displaying an unrelated direct-product quote', async () => {
    const basket = [{ ...directItem, productId: 99, token: 'different-product' }];
    window.localStorage.setItem('bric:cart:v1', JSON.stringify(basket));
    window.localStorage.setItem(
      'bric:checkout:pending:v1',
      JSON.stringify({
        idempotencyKey: 'legacy-attempt',
        payload: order,
        createdAt: order.createdAt,
      }),
    );
    render(
      <CheckoutForm
        locale="ar"
        catalog={catalog}
        directItem={{ ...basket[0], title: 'Different product' }}
        labels={labels}
      />,
    );
    expect(screen.queryByText('Different product')).not.toBeInTheDocument();
    expect(document.querySelector('.checkout-summary dl')).toBeNull();
    expect(screen.getByRole('textbox', { name: /phone/ })).toHaveValue(order.phoneNumber1);
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]).toEqual([
      expect.objectContaining({ cartProducts: order.cartProducts }),
      'legacy-attempt',
    ]);
    expect(JSON.parse(window.localStorage.getItem('bric:cart:v1')!)).toEqual(basket);
  });

  it('keeps a pending direct purchase independent of the current cart route and delivery catalog', async () => {
    const basket = [{ ...directItem, productId: 99, token: 'different-product' }];
    window.localStorage.setItem('bric:cart:v1', JSON.stringify(basket));
    window.localStorage.setItem(
      'bric:checkout:pending:v1',
      JSON.stringify({
        idempotencyKey: 'direct-attempt',
        payload: { ...order, delivery: 1 },
        items: [directItem],
        cartMode: 'direct',
        deliveryFee: 300,
        createdAt: order.createdAt,
      }),
    );
    const updatedCatalog = {
      ...catalog,
      communes: [{ ...catalog.communes[0], hasStopDesk: false }],
      serviceFees: [{ ...catalog.serviceFees[0], stopDeskFee: '900' }],
    };
    render(<CheckoutForm locale="ar" catalog={updatedCatalog} directItem={null} labels={labels} />);
    expect(screen.getByRole('button', { name: /^officeDelivery/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.querySelector('.checkout-summary dl')).toHaveTextContent(/300|٣٠٠/);
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]).toEqual([
      expect.objectContaining({ delivery: 1 }),
      'direct-attempt',
    ]);
    expect(JSON.parse(window.localStorage.getItem('bric:cart:v1')!)).toEqual(basket);
    expect(JSON.parse(window.localStorage.getItem('bric:checkout:confirmation:v1')!).cartMode).toBe(
      'direct',
    );
  });

  it('retains cart mode after an expired promotion is rejected on a resumed direct-product route', async () => {
    const discounted = { ...directItem, promoCode: 'EXPIRED', unitPrice: 4000 };
    window.localStorage.setItem('bric:cart:v1', JSON.stringify([discounted]));
    window.localStorage.setItem(
      'bric:checkout:pending:v1',
      JSON.stringify({
        idempotencyKey: 'cart-attempt',
        payload: { ...order, promoCode: 'EXPIRED', expectedProductSubtotal: 8000 },
        items: [discounted],
        cartMode: 'cart',
        createdAt: order.createdAt,
      }),
    );
    mocks.create
      .mockRejectedValueOnce(
        new CheckoutOrderError('expired', { code: 'cart_changed', status: 409 }),
      )
      .mockResolvedValueOnce(order);
    mocks.reconcile.mockResolvedValue({
      items: [directItem],
      changed: true,
      requiresReview: true,
      removedProductIds: [],
      priceChangedProductIds: [12],
    });
    render(
      <CheckoutForm
        locale="ar"
        catalog={catalog}
        directItem={{ ...directItem, productId: 99, token: 'different-product' }}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findByText('cartUpdated')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('bric:cart:v1')!)[0].unitPrice).toBe(4500);
    mocks.reconcile.mockResolvedValue({
      items: [directItem],
      changed: false,
      requiresReview: false,
      removedProductIds: [],
      priceChangedProductIds: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][0]).toMatchObject({
      promoCode: null,
      expectedProductSubtotal: 9000,
    });
    expect(JSON.parse(window.localStorage.getItem('bric:checkout:confirmation:v1')!).cartMode).toBe(
      'cart',
    );
  });
  it('unlocks customer details after a definite server validation rejection', async () => {
    mocks.create
      .mockRejectedValueOnce(new CheckoutOrderError('invalid', { code: 'validation', status: 400 }))
      .mockResolvedValueOnce(order);
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findByText('submitError')).toBeInTheDocument();
    expect(window.localStorage.getItem('bric:checkout:pending:v1')).toBeNull();
    expect(screen.getByRole('textbox', { name: /phone/ })).toBeEnabled();
    const firstKey = mocks.create.mock.calls[0][1];
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][1]).not.toBe(firstKey);
    expect(mocks.create.mock.calls[1][0].phoneNumber1).toBe('0550000001');
  });
  it('stops an oversized basket before validation or order submission without changing its quantities', async () => {
    const items = [12, 13, 14].map((productId) => ({ ...directItem, productId, quantity: 20 }));
    window.localStorage.setItem('bric:cart:v1', JSON.stringify(items));
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={null} labels={labels} />);
    expect(await screen.findByText('quantityLimit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    const opened = vi.fn();
    window.addEventListener('bric:cart-open', opened);
    fireEvent.click(screen.getByRole('button', { name: 'editCart' }));
    expect(opened).toHaveBeenCalledOnce();
    window.removeEventListener('bric:cart-open', opened);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      JSON.parse(window.localStorage.getItem('bric:cart:v1')!).map(
        (item: { quantity: number }) => item.quantity,
      ),
    ).toEqual([20, 20, 20]);
  });

  it.each([
    { code: 'rate_limit' as const, status: 429, label: 'rateLimit' },
    { code: 'conflict' as const, status: 409, label: 'submitError' },
  ])(
    'preserves the $code deadline and disables both retry controls',
    async ({ code, status, label }) => {
      mocks.create.mockRejectedValue(
        new CheckoutOrderError('limited', {
          code,
          status,
          retryAfterSeconds: 310,
        }),
      );
      const mounted = render(
        <CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />,
      );
      fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
        target: { value: '0550000000' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), {
        target: { value: '16' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
        target: { value: 'Alger Centre' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'submit' }));
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'retry' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
      expect(
        JSON.parse(window.localStorage.getItem('bric:checkout:pending:v1')!).retryAt,
      ).toBeGreaterThan(Date.now() + 300_000);
      mounted.unmount();
      render(
        <CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />,
      );
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'retry' })).toBeDisabled();
    },
  );
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    window.localStorage.clear();
    mocks.push.mockReset();
    mocks.create.mockReset().mockResolvedValue(order);
    mocks.track.mockReset();
    mocks.haptic.mockReset();
    mocks.iconStart.mockReset();
    mocks.iconStop.mockReset();
    mocks.reconcile.mockReset().mockImplementation(async (items) => ({
      items,
      removedProductIds: [],
      priceChangedProductIds: [],
      changed: false,
      requiresReview: false,
    }));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  it('renders the required checkout fields without introducing a second phone field', () => {
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        labels={labels}
        support={support}
      />,
    );
    expect(screen.getByRole('textbox', { name: /phone/ })).toHaveAttribute('name', 'phoneNumber1');
    expect(screen.getByRole('textbox', { name: /lastName/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /firstName/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /wilaya/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /commune/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /address/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/ })).toBeInTheDocument();
    expect(document.querySelector('[name="phoneNumber2"]')).toBeNull();
  });
});
