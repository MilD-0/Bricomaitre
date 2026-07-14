import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutForm } from './checkout-form';

const mocks = vi.hoisted(() => ({
  push: vi.fn(), create: vi.fn(), track: vi.fn(), identity: vi.fn(() => ({ journeyId: 'journey-1', sessionId: 'session-1' })), haptic: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return { ...actual, createCheckoutOrder: mocks.create };
});
vi.mock('@/lib/analytics', () => ({ getAnalyticsIdentity: mocks.identity, trackCheckoutEvent: mocks.track }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: vi.fn(), triggerHaptic: mocks.haptic }));
vi.mock('@/components/storefront-image', () => ({ StorefrontImage: ({ src }: { src: string }) => <span data-image-src={src} /> }));
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));

const labels = Object.fromEntries([
  'eyebrow', 'title', 'description', 'phone', 'phonePlaceholder', 'lastName', 'firstName', 'wilaya', 'commune', 'address', 'email', 'optional',
  'deliveryMode', 'homeDelivery', 'officeDelivery', 'officeUnavailable', 'orderSummary', 'subtotal', 'delivery', 'total', 'quantity', 'submit', 'submitting',
  'emptyTitle', 'emptyBody', 'browseProducts', 'requiredError', 'emailError', 'submitError', 'retry', 'savedAttempt', 'trustPhone', 'trustPayment', 'trustDelivery',
].map((key) => [key, key])) as Record<string, string>;

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [{ communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true }],
  serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' }],
  weightFees: [], lastSync: null,
};

const directItem = { productId: 12, token: 'desk-lamp', title: 'Desk Lamp', imageUrl: null, unitPrice: 4500, quantity: 2, availabilityStatus: 'in_stock' };
const order = {
  id: 42, publicToken: 'public-order-token-1234567890', createdAt: '2026-07-14T10:00:00.000Z', updatedAt: '2026-07-14T10:00:00.000Z',
  firstName: 'Ada', lastName: null, fullName: 'Ada', email: null, phoneNumber1: '0550000000', phoneNumber2: null,
  cartProducts: ['desk-lamp', 'desk-lamp'], orderProducts: [{ productId: 12, rawValue: 'desk-lamp', title: 'Desk Lamp', unitPrice: 4500, quantity: 2, lineTotal: 9000, thumbnailUrl: null, missing: false }],
  delivery: 0, state: 16, city: 'Alger Centre', homeAddress: null, productSubtotal: 9000, deliveryFee: 500, totalAmount: 9500,
  promoCode: null, promoProductId: null, promoOriginalSubtotal: null, promoDiscountAmount: 0, promoFinalSubtotal: null,
  note: null, confirmed: 0, noAnswerCount: 0, confirmedAt: null, hasStatusHistory: false, statusHistory: [],
};

describe('CheckoutForm', () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.localStorage.clear();
    mocks.push.mockReset(); mocks.create.mockReset().mockResolvedValue(order); mocks.track.mockReset(); mocks.haptic.mockReset();
  });

  it('renders the legacy storefront fields without introducing a second phone field', () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels as never} />);
    expect(screen.getByRole('textbox', { name: /phone/ })).toHaveAttribute('name', 'phoneNumber1');
    expect(screen.getByRole('textbox', { name: /lastName/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /firstName/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /wilaya/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /commune/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /address/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/ })).toBeInTheDocument();
    expect(document.querySelector('[name="phoneNumber2"]')).toBeNull();
  });

  it('announces validation errors and moves focus to the first required field', async () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    const phone = screen.getByRole('textbox', { name: /phone/ });
    await waitFor(() => expect(phone).toHaveFocus());
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates an idempotent direct-product order and stores its verified handoff snapshot', async () => {
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels as never} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), { target: { value: '0550000000' } });
    fireEvent.change(screen.getByRole('textbox', { name: /firstName/ }), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), { target: { value: 'Alger Centre' } });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const [payload, idempotencyKey] = mocks.create.mock.calls[0];
    expect(idempotencyKey).toEqual(expect.any(String));
    expect(payload).toMatchObject({ phoneNumber1: '0550000000', firstName: 'Ada', cartProducts: ['desk-lamp', 'desk-lamp'], journeyId: 'journey-1' });
    expect(window.localStorage.getItem('bric:checkout:pending:v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('bric:checkout:confirmation:v1')!)).toMatchObject({ cartMode: 'direct', order: { id: 42 } });
    expect(mocks.push).toHaveBeenCalledWith('/fr/thank-you?orderId=42&token=public-order-token-1234567890');
    expect(mocks.track.mock.calls.flatMap((call) => JSON.stringify(call))).not.toContain('0550000000');
  });

  it('keeps the attempt and exposes a retry action after a recoverable failure', async () => {
    mocks.create.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(order);
    render(<CheckoutForm locale="fr" catalog={catalog} directItem={directItem} labels={labels as never} />);
    fireEvent.change(screen.getByRole('textbox', { name: /phone/ }), { target: { value: '0550000000' } });
    fireEvent.change(screen.getByRole('combobox', { name: /wilaya/ }), { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /commune/ }), { target: { value: 'Alger Centre' } });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findByRole('button', { name: 'retry' })).toBeInTheDocument();
    const firstKey = mocks.create.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][1]).toBe(firstKey);
  });
});
