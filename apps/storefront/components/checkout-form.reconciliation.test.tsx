import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('uses a canonicalized token without forcing another click when only product metadata changed', async () => {
    mocks.reconcile.mockResolvedValue({
      items: [{ ...directItem, token: 'canonical-desk-lamp', title: 'Updated title' }],
      removedProductIds: [],
      priceChangedProductIds: [],
      changed: true,
      requiresReview: false,
    });
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
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

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0].cartProducts).toEqual(['12', '12']);
  });

  it('retains a cross-tab addition while reviewing a changed price', async () => {
    window.localStorage.setItem('bric:cart:v1', JSON.stringify([directItem]));
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={null} labels={labels} />);
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1));
    let release!: (value: unknown) => void;
    mocks.reconcile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    window.localStorage.setItem('bric:cart:v1', JSON.stringify([{ ...directItem, quantity: 3 }]));
    window.dispatchEvent(new Event('storage'));
    release({
      items: [{ ...directItem, unitPrice: 4700 }],
      changed: true,
      requiresReview: true,
      removedProductIds: [],
      priceChangedProductIds: [12],
    });
    expect(await screen.findByText('cartUpdated')).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem('bric:cart:v1')!)).toMatchObject([
      { quantity: 3, unitPrice: 4700 },
    ]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('requires explicit review when catalog revalidation changes a price', async () => {
    mocks.reconcile.mockResolvedValue({
      items: [{ ...directItem, unitPrice: 4700 }],
      removedProductIds: [],
      priceChangedProductIds: [12],
      changed: true,
      requiresReview: true,
    });
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
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

    expect(await screen.findByText('cartUpdated')).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(['retry', 'submit'])(
    'reuses the committed attempt through %s after a lost response',
    async (control) => {
      mocks.create.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(order);
      render(
        <CheckoutForm
          locale="fr"
          catalog={catalog}
          directItem={directItem}
          labels={labels}
          support={support}
        />,
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
      fireEvent.change(screen.getByRole('textbox', { name: /address/ }), {
        target: { value: '12 rue des Outils' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'submit' }));
      expect(await screen.findByRole('button', { name: 'retry' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /Call.*0795 34 28 26/ }).length).toBeGreaterThan(
        0,
      );
      const firstKey = mocks.create.mock.calls[0][1];
      expect(screen.getByRole('textbox', { name: /phone/ })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: control }));
      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
      expect(mocks.create.mock.calls[1][1]).toBe(firstKey);
      expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
    },
  );
  it('submits without attribution if tracking preparation fails', async () => {
    mocks.identity.mockImplementationOnce(() => {
      throw new Error('Tracking unavailable');
    });
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        labels={labels}
        embedded
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      phoneNumber1: '0550000000',
      journeyId: null,
    });
    expect(mocks.create.mock.calls[0][0].marketing).toBeUndefined();
    expect(mocks.push).toHaveBeenCalledWith('/fr/thank-you?token=public-order-token-1234567890');
  });

  it('shows progress during catalog validation and exposes a recoverable failure', async () => {
    let fail!: (error: Error) => void;
    mocks.reconcile.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        labels={labels}
        embedded
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(screen.getByRole('button', { name: 'submitting' })).toBeDisabled();
    fail(new Error('Request timed out'));
    expect(await screen.findByRole('alert')).toHaveTextContent('submitError');
    expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
