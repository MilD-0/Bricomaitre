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
  cartProducts: ['desk-lamp', 'desk-lamp'],
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

  it('carries landing-page revision attribution into checkout events', async () => {
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        landingAttribution={{ landingPageId: 4, landingRevision: 2 }}
        labels={labels}
      />,
    );
    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'begin_checkout',
          metadata: expect.objectContaining({
            landingPageId: 4,
            landingRevision: 2,
            items: [{ productId: 12, productSlug: 'desk-lamp', quantity: 2, price: 4500 }],
          }),
        }),
      ),
    );
  });

  it('embeds with a section heading and accepts landing-page quantity changes', async () => {
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        embedded
        labels={labels}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'title' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1, name: 'title' })).not.toBeInTheDocument();
    expect(document.querySelector('#landing-order')).toHaveClass('landing-order-section');

    window.dispatchEvent(
      new CustomEvent('bric:landing-order-quantity', { detail: { productId: 12, quantity: 5 } }),
    );
    await waitFor(() => expect(screen.getByText('quantity: 5')).toBeVisible());
    expect(screen.getAllByText((content) => content.replace(/\s/g, '') === '22500DA')).toHaveLength(
      3,
    );
  });

  it('announces validation errors and moves focus to the first required field', async () => {
    render(
      <CheckoutForm
        locale="fr"
        catalog={catalog}
        directItem={directItem}
        labels={labels}
        support={support}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    const phone = screen.getByRole('textbox', { name: /phone/ });
    await waitFor(() => expect(phone).toHaveFocus());
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('uses a specific error for an invalid Algerian phone number', async () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '1234567890' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /address/ }), {
      target: { value: '12 rue des Outils' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByText('phoneError')).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('restores and continuously saves checkout details for future visits', async () => {
    window.localStorage.setItem(
      'bric:checkout:draft:v1',
      JSON.stringify({
        phoneNumber1: '0774246465',
        lastName: 'Client',
        firstName: 'Test',
        state: 16,
        city: 'Alger Centre',
        homeAddress: '12 rue des Outils',
        email: 'client@example.com',
        delivery: 'office',
      }),
    );
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /phone/ })).toHaveValue('0774246465'),
    );
    expect(screen.getByRole('textbox', { name: /lastName/ })).toHaveValue('Client');
    expect(screen.getByRole('combobox', { name: /wilaya/ })).toHaveValue('16');
    expect(screen.getByRole('combobox', { name: /commune/ })).toHaveValue('Alger Centre');
    expect(screen.getByRole('button', { name: /officeDelivery/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.change(screen.getByRole('textbox', { name: /firstName/ }), {
      target: { value: 'Updated' },
    });
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('bric:checkout:draft:v1')!).firstName).toBe(
        'Updated',
      ),
    );
  });

  it('keeps the address optional for home delivery', async () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    const address = screen.getByRole('textbox', { name: /address/ });

    expect(address).not.toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ delivery: 0, homeAddress: null });
  });

  it('animates the shield from the full submit-button hover target', () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
    const submit = screen.getByRole('button', { name: 'submit' });

    expect(screen.getByTestId('animated-shield')).toBeVisible();
    fireEvent.mouseEnter(submit);
    fireEvent.mouseLeave(submit);

    expect(mocks.iconStart).toHaveBeenCalledOnce();
    expect(mocks.iconStop).toHaveBeenCalledOnce();
  });

  it('creates an idempotent direct-product order and stores its verified handoff snapshot', async () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), {
      target: { value: '0550000000' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /firstName/ }), {
      target: { value: 'Ada' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /address/ }), {
      target: { value: '12 rue des Outils' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const [payload, idempotencyKey] = mocks.create.mock.calls[0];
    expect(idempotencyKey).toEqual(expect.any(String));
    expect(payload).toMatchObject({
      phoneNumber1: '0550000000',
      firstName: 'Ada',
      cartProducts: ['desk-lamp', 'desk-lamp'],
      journeyId: 'journey-1',
    });
    expect(window.localStorage.getItem('bric:checkout:pending:v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('bric:checkout:confirmation:v1')!)).toMatchObject(
      { cartMode: 'direct', order: { id: 42 } },
    );
    expect(mocks.push).toHaveBeenCalledWith('/fr/thank-you?token=public-order-token-1234567890');
    expect(mocks.track.mock.calls.flatMap((call) => JSON.stringify(call))).not.toContain(
      '0550000000',
    );
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
    expect(mocks.create.mock.calls[0][0].cartProducts).toEqual([
      'canonical-desk-lamp',
      'canonical-desk-lamp',
    ]);
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

  it('keeps the attempt and exposes a retry action after a recoverable failure', async () => {
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
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), {
      target: { value: 'Alger Centre' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /address/ }), {
      target: { value: '12 rue des Outils' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findByRole('button', { name: 'retry' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Call.*0795 34 28 26/ }).length).toBeGreaterThan(0);
    const firstKey = mocks.create.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][1]).toBe(firstKey);
  });
});
