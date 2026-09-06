import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepageAddToCart } from './homepage-add-to-cart';

const mocks = vi.hoisted(() => ({ track: vi.fn(), haptic: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackProductEvent: mocks.track }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: mocks.haptic, prepareHaptics: mocks.prepare }));

describe('HomepageAddToCart', () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.localStorage.clear();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });
  it('does not announce or track an addition rejected by browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    try {
      render(
        <HomepageAddToCart
          locale="fr"
          label="Ajouter"
          item={{
            productId: 12,
            token: 'drill',
            title: 'Drill',
            imageUrl: null,
            unitPrice: 4500,
            availabilityStatus: 'in_stock',
          }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
      expect(mocks.track).not.toHaveBeenCalled();
      expect(mocks.haptic).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    } finally {
      setItem.mockRestore();
    }
  });
  it('persists the product, updates the drawer, tracks analytics, and confirms the action', () => {
    const listener = vi.fn();
    window.addEventListener('bric:cart-updated', listener);
    render(
      <HomepageAddToCart
        locale="fr"
        label="Ajouter"
        item={{
          productId: 12,
          token: 'drill',
          title: 'Drill',
          imageUrl: null,
          unitPrice: 4500,
          availabilityStatus: 'in_stock',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(window.localStorage.getItem('bric:cart:v1')).toContain('"productId":12');
    expect(listener).toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'add_to_cart', productId: 12 }),
    );
    expect(mocks.haptic).toHaveBeenCalledWith('success');
    expect(screen.getByRole('status')).toHaveTextContent('Produit ajouté au panier');
    window.removeEventListener('bric:cart-updated', listener);
  });
});
