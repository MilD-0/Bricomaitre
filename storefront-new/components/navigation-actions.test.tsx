import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_CART_KEY } from '@/lib/cart';
import { NavigationActions } from './navigation-actions';

const analytics = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/products',
  useSearchParams: () => new URLSearchParams('brand=2'),
}));
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: analytics }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: haptics.prepare, triggerHaptic: haptics.trigger }));

const labels = {
  menu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  cart: 'Panier',
  language: 'Langue',
  home: 'Accueil',
  products: 'Produits',
  categories: 'Catégories',
  cartDrawer: {
    title: 'Votre panier', close: 'Fermer le panier', emptyTitle: 'Votre panier est vide',
    emptyDescription: 'Ajoutez des outils.', continueShopping: 'Voir les produits', subtotal: 'Sous-total',
    checkout: 'Passer la commande', quantity: 'Quantité', increase: 'Augmenter la quantité',
    decrease: 'Diminuer la quantité', remove: 'Retirer',
  },
};

describe('NavigationActions', () => {
  beforeEach(() => {
    analytics.mockClear();
    haptics.prepare.mockClear();
    haptics.trigger.mockClear();
    localStorage.clear();
    window.history.replaceState({}, '', '/fr/products?brand=2');
    localStorage.setItem(STOREFRONT_CART_KEY, JSON.stringify([{
      productId: 12,
      token: 'desk-lamp',
      title: 'Lampe',
      imageUrl: null,
      unitPrice: 4500,
      quantity: 3,
      availabilityStatus: 'in_stock',
    }]));
  });

  afterEach(cleanup);

  it('shows the total item quantity and preserves route state when switching locale', async () => {
    render(
      <NavigationActions
        locale="fr"
        alternateLocale="ar"
        alternateLabel="العربية"
        categories={[{ id: 3, label: 'Éclairage' }]}
        labels={labels}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Panier: 3' })).toBeVisible();
    const languageToggle = screen.getByRole('group', { name: labels.language });
    const arabicLink = await screen.findByRole('link', { name: /العربية/ });
    expect(languageToggle).toHaveAttribute('data-selected', 'fr');
    expect(arabicLink).toHaveAttribute('href', '/ar/products?brand=2');
    fireEvent.pointerDown(arabicLink);
    fireEvent.click(arabicLink);
    expect(languageToggle).toHaveAttribute('data-selected', 'ar');
    expect(haptics.prepare).toHaveBeenCalled();
    expect(haptics.trigger).toHaveBeenCalledWith('selection');
    expect(analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'locale_change' }));
  });

  it('opens the live cart in a dialog and links onward to checkout', async () => {
    render(
      <NavigationActions
        locale="fr"
        alternateLocale="ar"
        alternateLabel="العربية"
        categories={[]}
        labels={labels}
      />,
    );

    const cartButton = await screen.findByRole('button', { name: 'Panier: 3' });
    fireEvent.pointerDown(cartButton);
    fireEvent.click(cartButton);
    expect(screen.getByRole('dialog', { name: labels.cartDrawer.title })).toBeVisible();
    expect(screen.getByRole('link', { name: labels.cartDrawer.checkout })).toHaveAttribute('href', '/fr/checkout');
    expect(analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'view_cart', quantity: 3 }));
  });

  it('opens an accessible drawer with categories and closes it with Escape', () => {
    render(
      <NavigationActions
        locale="fr"
        alternateLocale="ar"
        alternateLabel="العربية"
        categories={[{ id: 3, label: 'Éclairage' }]}
        labels={labels}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: labels.menu }));
    fireEvent.click(screen.getByRole('button', { name: labels.menu }));
    expect(screen.getByRole('dialog', { name: labels.menu })).toBeVisible();
    expect(screen.getByRole('link', { name: /Éclairage/ })).toHaveAttribute('href', '/fr/products?category=3');
    expect(haptics.trigger).toHaveBeenCalledWith('light');
    expect(analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'navigation_menu_open' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: labels.menu })).not.toBeInTheDocument();
  });
});
