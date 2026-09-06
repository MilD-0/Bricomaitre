import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_CART_KEY, type CartItem } from '@/lib/cart';
import { CartDrawer } from './cart-drawer';
import { useState } from 'react';

const analytics = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: analytics }));
vi.mock('@/lib/haptics', () => ({
  prepareHaptics: haptics.prepare,
  triggerHaptic: haptics.trigger,
}));

const labels = {
  title: 'Votre panier',
  close: 'Fermer le panier',
  emptyTitle: 'Votre panier est vide',
  emptyDescription: 'Ajoutez des outils.',
  continueShopping: 'Voir les produits',
  subtotal: 'Sous-total',
  checkout: 'Passer la commande',
  quantity: 'Quantité',
  increase: 'Augmenter la quantité',
  decrease: 'Diminuer la quantité',
  remove: 'Retirer',
};

const item: CartItem = {
  productId: 12,
  token: 'desk-lamp',
  title: 'Lampe de travail',
  imageUrl: null,
  unitPrice: 4500,
  quantity: 1,
  availabilityStatus: 'in_stock',
};

describe('CartDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    analytics.mockClear();
    haptics.prepare.mockClear();
    haptics.trigger.mockClear();
  });

  afterEach(cleanup);

  it('updates quantity in storage and reports the commerce interaction', () => {
    const onItemsChange = vi.fn();
    render(
      <CartDrawer
        locale="fr"
        items={[item]}
        labels={labels}
        onClose={vi.fn()}
        onItemsChange={onItemsChange}
      />,
    );

    expect(screen.getByRole('dialog', { name: labels.title })).toBeVisible();
    expect(screen.getByRole('dialog', { name: labels.title }).parentElement?.parentElement).toBe(
      document.body,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: `${labels.increase}: ${item.title}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: `${labels.increase}: ${item.title}` }));

    expect(JSON.parse(localStorage.getItem(STOREFRONT_CART_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ productId: 12, quantity: 2 }),
    ]);
    expect(onItemsChange).toHaveBeenCalledWith([expect.objectContaining({ quantity: 2 })]);
    expect(haptics.prepare).toHaveBeenCalled();
    expect(haptics.trigger).toHaveBeenCalledWith('control');
    expect(analytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'add_to_cart', productId: 12, quantity: 1 }),
    );
  });

  it('keeps the visible cart and emits no commerce event when persistence fails', () => {
    const onItemsChange = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    try {
      render(
        <CartDrawer
          locale="fr"
          items={[item]}
          labels={labels}
          onClose={vi.fn()}
          onItemsChange={onItemsChange}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: `${labels.increase}: ${item.title}` }));
      fireEvent.click(screen.getByRole('button', { name: `${labels.remove}: ${item.title}` }));
      expect(onItemsChange).not.toHaveBeenCalled();
      expect(analytics).not.toHaveBeenCalled();
      expect(haptics.trigger).not.toHaveBeenCalled();
      expect(screen.getByText(item.title)).toBeVisible();
    } finally {
      setItem.mockRestore();
    }
  });

  it('removes an item and closes with Escape', () => {
    const onClose = vi.fn();
    const onItemsChange = vi.fn();
    render(
      <CartDrawer
        locale="fr"
        items={[item]}
        labels={labels}
        onClose={onClose}
        onItemsChange={onItemsChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: `${labels.remove}: ${item.title}` }));
    expect(onItemsChange).toHaveBeenCalledWith([]);
    expect(localStorage.getItem(STOREFRONT_CART_KEY)).toBe('[]');
    expect(analytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'remove_from_cart', quantity: 1, value: 4500 }),
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: labels.title }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a useful empty state', () => {
    render(
      <CartDrawer
        locale="ar"
        items={[]}
        labels={labels}
        onClose={vi.fn()}
        onItemsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: labels.emptyTitle })).toBeVisible();
    expect(screen.getByRole('link', { name: labels.continueShopping })).toHaveAttribute(
      'href',
      '/ar/products',
    );
  });
  it('keeps focus inside the cart when its last focused item is removed', () => {
    const close = vi.fn();
    function Cart() {
      const [items, setItems] = useState([item]);
      return (
        <CartDrawer
          locale="fr"
          items={items}
          labels={labels}
          onClose={close}
          onItemsChange={setItems}
        />
      );
    }
    render(<Cart />);
    const remove = screen.getByRole('button', { name: `${labels.remove}: ${item.title}` });
    remove.focus();
    fireEvent.click(remove);
    expect(screen.getByText(labels.emptyTitle)).toBeVisible();
    expect(document.activeElement).toHaveAttribute('aria-label', labels.close);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
