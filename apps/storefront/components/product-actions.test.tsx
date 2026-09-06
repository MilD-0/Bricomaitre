import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductActions } from './product-actions';
import { STOREFRONT_CART_KEY } from '@/lib/cart';

const { routerPushMock, trackProductEventMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  trackProductEventMock: vi.fn(),
}));
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ trackProductEvent: trackProductEventMock }));
vi.mock('@/lib/haptics', () => ({
  prepareHaptics: haptics.prepare,
  triggerHaptic: haptics.trigger,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock }) }));
const labels = {
  quantity: 'Quantité',
  decrease: 'Diminuer la quantité',
  increase: 'Augmenter la quantité',
  addToCart: 'Ajouter au panier',
  buyNow: 'Commander maintenant',
  added: 'Produit ajouté au panier.',
  unavailable: 'Indisponible',
};

const props = {
  locale: 'fr' as const,
  available: true,
  item: {
    productId: 12,
    token: 'desk-lamp',
    title: 'Desk Lamp',
    imageUrl: null,
    unitPrice: 1500,
    availabilityStatus: 'in_stock',
  },
  analytics: { categoryId: 3, categorySlug: 'lighting', brandId: 2, brandSlug: 'bric' },
  labels,
};

describe('ProductActions', () => {
  it('carries the accepted promotion through both cart and direct checkout', () => {
    render(
      <ProductActions {...props} item={{ ...props.item, promoCode: 'AUDIT10', unitPrice: 1200 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: labels.addToCart }));
    expect(JSON.parse(window.localStorage.getItem(STOREFRONT_CART_KEY)!)[0]).toMatchObject({
      promoCode: 'AUDIT10',
      unitPrice: 1200,
    });
    fireEvent.click(screen.getByRole('button', { name: labels.buyNow }));
    expect(routerPushMock).toHaveBeenCalledWith(
      '/fr/checkout?product=desk-lamp&quantity=1&promo=AUDIT10',
    );
  });
  beforeEach(() => {
    window.localStorage.clear();
    trackProductEventMock.mockReset();
    trackProductEventMock.mockResolvedValue(null);
    routerPushMock.mockReset();
    haptics.prepare.mockReset();
    haptics.trigger.mockReset();
  });

  afterEach(() => cleanup());

  it('supports keyboard-friendly quantity changes and adds a validated cart item', () => {
    render(<ProductActions {...props} />);

    fireEvent.click(screen.getByRole('button', { name: labels.increase }));
    const quantityOutput = screen.getByLabelText(`${labels.quantity}: 2`);
    expect(quantityOutput).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: labels.addToCart }));

    expect(screen.getByText(labels.added)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STOREFRONT_CART_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ productId: 12, quantity: 2, unitPrice: 1500 }),
    ]);
    expect(trackProductEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'add_to_cart',
        quantity: 2,
        value: 3000,
      }),
    );
    expect(haptics.prepare).toHaveBeenCalledOnce();
    expect(haptics.trigger.mock.calls).toEqual([['control'], ['success']]);
  });

  it('renders a clear non-interactive state when the product is unavailable', () => {
    render(<ProductActions {...props} available={false} />);
    expect(screen.getByText(labels.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not announce success or play success feedback when cart storage fails', () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    render(<ProductActions {...props} />);

    fireEvent.click(screen.getByRole('button', { name: labels.addToCart }));

    expect(screen.queryByText(labels.added)).not.toBeInTheDocument();
    expect(haptics.trigger).not.toHaveBeenCalledWith('success');
    expect(trackProductEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'add_to_cart' }),
    );
    storageWrite.mockRestore();
  });

  it('presents direct checkout as the primary action without obscuring cart choice', () => {
    render(<ProductActions {...props} />);

    const buyNow = screen.getByRole('button', { name: labels.buyNow });
    const addToCart = screen.getByRole('button', { name: labels.addToCart });
    expect(buyNow).toHaveClass('button-primary');
    expect(buyNow).toHaveClass('product-buy-now');
    expect(addToCart).toHaveClass('button-secondary');
    expect(addToCart).toHaveClass('product-add-to-cart');
    expect(buyNow.querySelector('.product-buy-now-icon')).toBeInTheDocument();
    expect(
      buyNow.compareDocumentPosition(addToCart) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('allows a focused campaign to suppress the secondary cart action', () => {
    render(<ProductActions {...props} showAddToCart={false} />);
    expect(screen.getByRole('button', { name: labels.buyNow })).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.addToCart })).not.toBeInTheDocument();
  });

  it('uses client-side navigation for direct checkout', () => {
    render(<ProductActions {...props} />);

    fireEvent.click(screen.getByRole('button', { name: labels.buyNow }));

    expect(routerPushMock).toHaveBeenCalledWith('/fr/checkout?product=desk-lamp&quantity=1');
  });

  it('moves landing-page buyers into the inline form with their selected quantity', () => {
    const orderSection = document.createElement('section');
    orderSection.id = 'landing-order';
    orderSection.innerHTML = '<input aria-label="Order phone" />';
    orderSection.scrollIntoView = vi.fn();
    document.body.append(orderSection);
    const quantityEvents: Array<{ productId: number; quantity: number }> = [];
    window.addEventListener(
      'bric:landing-order-quantity',
      (event: Event) => {
        quantityEvents.push((event as CustomEvent<{ productId: number; quantity: number }>).detail);
      },
      { once: true },
    );

    render(<ProductActions {...props} buyNowTarget="#landing-order" />);
    fireEvent.click(screen.getByRole('button', { name: labels.increase }));
    fireEvent.click(screen.getByRole('button', { name: labels.buyNow }));

    expect(quantityEvents).toEqual([{ productId: 12, quantity: 2 }]);
    expect(orderSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(window.location.hash).toBe('#landing-order');
  });
});
