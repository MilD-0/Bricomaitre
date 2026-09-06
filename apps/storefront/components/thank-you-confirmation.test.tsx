import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHECKOUT_CONFIRMATION_KEY } from '@/lib/checkout';
import type { StorefrontOrderResponseItem } from '@bric/storefront-core/contracts';
import { ThankYouConfirmation } from './thank-you-confirmation';
import { CheckoutOrderError } from '@/lib/orders';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/orders', async (original) => ({
  ...(await original<typeof import('@/lib/orders')>()),
  verifyCheckoutOrderByToken: mocks.verify,
}));
vi.mock('@/lib/analytics', () => ({ trackCheckoutEvent: mocks.track }));
vi.mock('@/components/storefront-image', () => ({
  StorefrontImage: ({ src }: { src: string }) => <span data-image-src={src} />,
}));
const labelKeys = [
  'verifying',
  'title',
  'description',
  'orderNumber',
  'nextTitle',
  'nextOne',
  'nextTwo',
  'nextThree',
  'summary',
  'quantity',
  'subtotal',
  'delivery',
  'total',
  'customer',
  'phone',
  'wilaya',
  'commune',
  'address',
  'deliveryMode',
  'homeDelivery',
  'officeDelivery',
  'fallback',
  'unavailableTitle',
  'unavailableBody',
  'retry',
  'browseProducts',
  'trackingTitle',
  'trackingLive',
  'trackingWaiting',
  'trackingPreparing',
  'trackingOnWay',
  'trackingDelivered',
  'trackingDelayed',
  'trackingCancelled',
  'trackingReturned',
  'trackingFailed',
] as const;
const labels: ComponentProps<typeof ThankYouConfirmation>['labels'] = Object.fromEntries(
  labelKeys.map((key) => [key, key]),
) as Record<(typeof labelKeys)[number], string>;

const order: StorefrontOrderResponseItem = {
  id: 42,
  publicToken: 'public-order-token-1234567890',
  purchaseEventId: 'purchase-42',
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
  firstName: null,
  lastName: null,
  fullName: '',
  email: null,
  phoneNumber1: '0550000000',
  phoneNumber2: null,
  cartProducts: ['desk-lamp'],
  orderProducts: [
    {
      productId: 12,
      rawValue: 'desk-lamp',
      title: 'Desk Lamp',
      unitPrice: 4500,
      quantity: 1,
      lineTotal: 4500,
      thumbnailUrl: null,
      missing: false,
    },
  ],
  delivery: 0,
  state: 16,
  city: 'Alger Centre',
  homeAddress: '12 rue des Outils',
  productSubtotal: 4500,
  deliveryFee: 500,
  totalAmount: 5000,
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

const support = {
  contact: {
    phoneDisplay: '0795 34 28 26',
    phoneHref: 'tel:+213795342826',
    phoneEnabled: true,
    aiAssistantEnabled: true,
  },
  labels: { title: 'Order help', description: 'We are here.', call: 'Call' },
};

describe('ThankYouConfirmation', () => {
  it.each(['another-token', null])(
    'never displays a saved order under an unrelated token %s',
    async (token) => {
      window.localStorage.setItem(
        CHECKOUT_CONFIRMATION_KEY,
        JSON.stringify({ order, cartMode: 'cart', stateName: 'Alger', createdAt: order.createdAt }),
      );
      mocks.verify.mockRejectedValue(new TypeError('offline'));
      render(<ThankYouConfirmation locale="fr" orderId={null} token={token} labels={labels} />);
      expect(await screen.findByText('unavailableTitle')).toBeInTheDocument();
      expect(screen.queryByText(order.phoneNumber1)).not.toBeInTheDocument();
    },
  );

  it('hides a previously saved order when its token has been rejected', async () => {
    window.localStorage.setItem(
      CHECKOUT_CONFIRMATION_KEY,
      JSON.stringify({ order, cartMode: 'cart', stateName: 'Alger', createdAt: order.createdAt }),
    );
    mocks.verify.mockRejectedValue(
      new CheckoutOrderError('expired', { code: 'request_failed', status: 403 }),
    );
    render(
      <ThankYouConfirmation locale="fr" orderId={null} token={order.publicToken} labels={labels} />,
    );
    expect(await screen.findByText('unavailableTitle')).toBeInTheDocument();
    expect(screen.queryByText(order.phoneNumber1)).not.toBeInTheDocument();
  });

  it('uses the Arabic product title on Arabic confirmations', async () => {
    mocks.verify.mockResolvedValue({
      ...order,
      orderProducts: [{ ...order.orderProducts[0], titleAr: 'مصباح مكتب' }],
    });
    render(
      <ThankYouConfirmation locale="ar" orderId={null} token={order.publicToken} labels={labels} />,
    );
    expect(await screen.findByText('مصباح مكتب')).toBeInTheDocument();
    expect(screen.queryByText('Desk Lamp')).not.toBeInTheDocument();
  });
  afterEach(cleanup);
  beforeEach(() => {
    window.localStorage.clear();
    mocks.verify.mockReset();
    mocks.track.mockReset();
  });

  it('verifies the public token before recording purchase and renders the order snapshot', async () => {
    mocks.verify.mockResolvedValue(order);
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    expect(screen.getByText('0550000000')).toBeInTheDocument();
    expect(mocks.verify).toHaveBeenCalledWith('public-order-token-1234567890');
    expect(screen.getByRole('heading', { name: 'trackingTitle' })).toBeInTheDocument();
    expect(screen.getAllByText('trackingWaiting').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'purchase-42',
          eventName: 'purchase',
          orderId: 42,
          metadata: expect.objectContaining({
            items: [{ productId: 12, productSlug: 'desk-lamp', quantity: 1, price: 4500 }],
          }),
        }),
        'thank_you',
      ),
    );
    expect(mocks.track.mock.calls.flatMap((call) => JSON.stringify(call))).not.toContain(
      '0550000000',
    );
    expect(
      JSON.parse(window.localStorage.getItem(CHECKOUT_CONFIRMATION_KEY)!).purchaseEventId,
    ).toBe('purchase-42');
  });

  it('shows a layout-matched skeleton while order verification is pending', async () => {
    mocks.verify.mockImplementationOnce(() => new Promise(() => undefined));
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
      />,
    );
    expect(await screen.findByLabelText('Loading order confirmation')).toBeInTheDocument();
  });

  it('renders a server-verified confirmation before client JavaScript re-verifies it', () => {
    mocks.verify.mockImplementationOnce(() => new Promise(() => undefined));
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
        initialConfirmation={{
          order,
          cartMode: 'cart',
          stateName: null,
          createdAt: order.updatedAt,
          purchaseEventId: null,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading order confirmation')).not.toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('renders a connected rail with completed connectors and one current node', () => {
    mocks.verify.mockImplementationOnce(() => new Promise(() => undefined));
    const inDeliveryOrder = { ...order, inHouseStatus: 7 as const };
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
        initialConfirmation={{
          order: inDeliveryOrder,
          cartMode: 'cart',
          stateName: null,
          createdAt: order.updatedAt,
          purchaseEventId: null,
        }}
      />,
    );

    const stages = document.querySelectorAll('.order-tracking li');
    expect(stages).toHaveLength(4);
    expect(stages[0]).toHaveAttribute('data-connector-complete', 'true');
    expect(stages[1]).toHaveAttribute('data-connector-complete', 'true');
    expect(stages[2]).toHaveAttribute('aria-current', 'step');
    expect(stages[3]).not.toHaveAttribute('data-reached');
  });

  it('keeps a locally saved confirmation visible when server verification is unavailable', async () => {
    window.localStorage.setItem(
      CHECKOUT_CONFIRMATION_KEY,
      JSON.stringify({
        order,
        cartMode: 'direct',
        stateName: 'Alger',
        createdAt: '2026-07-14T10:00:00.000Z',
      }),
    );
    mocks.verify.mockRejectedValue(new TypeError('offline'));
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
      />,
    );
    expect(await screen.findByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('trackingLive')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'order_verification_failed_after_create',
        metadata: expect.objectContaining({ cartMode: 'direct', verificationSource: 'snapshot' }),
      }),
      'thank_you',
    );
  });

  it('replaces a degraded local product snapshot with the resolved server product', async () => {
    const missingOrder = {
      ...order,
      cartProducts: ['desk-lamp'],
      orderProducts: [
        {
          productId: null,
          rawValue: 'desk-lamp',
          title: 'desk-lamp',
          unitPrice: 0,
          quantity: 1,
          lineTotal: 0,
          thumbnailUrl: null,
          missing: true,
        },
      ],
      productSubtotal: 0,
      totalAmount: 500,
    };
    window.localStorage.setItem(
      CHECKOUT_CONFIRMATION_KEY,
      JSON.stringify({
        order: missingOrder,
        cartMode: 'direct',
        stateName: 'Alger',
        createdAt: '2026-07-14T10:00:00.000Z',
      }),
    );
    mocks.verify.mockResolvedValue(order);

    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
      />,
    );

    expect(await screen.findByText('Desk Lamp')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/^desk-lamp$/)).not.toBeInTheDocument());
    expect(
      JSON.parse(window.localStorage.getItem(CHECKOUT_CONFIRMATION_KEY)!).order.orderProducts[0],
    ).toMatchObject({
      productId: 12,
      title: 'Desk Lamp',
      unitPrice: 4500,
      missing: false,
    });
  });

  it('shows a recoverable state for an incomplete confirmation link', async () => {
    render(<ThankYouConfirmation locale="fr" orderId={null} token={null} labels={labels} />);
    expect(await screen.findByRole('heading', { name: 'unavailableTitle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('keeps a direct support route alongside a completed order', async () => {
    mocks.verify.mockResolvedValue(order);
    render(
      <ThankYouConfirmation
        locale="fr"
        orderId={42}
        token="public-order-token-1234567890"
        labels={labels}
        support={support}
      />,
    );
    expect(await screen.findByRole('link', { name: /Call.*0795 34 28 26/ })).toHaveAttribute(
      'href',
      'tel:+213795342826',
    );
  });
});
