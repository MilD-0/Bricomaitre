import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_CART_KEY } from '@/lib/cart';
import { NavigationActions } from './navigation-actions';

const analytics = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));
const navigationMeta = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/products',
  useSearchParams: () => new URLSearchParams('brand=2'),
}));
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: analytics }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: haptics.prepare, triggerHaptic: haptics.trigger }));
vi.mock('@/lib/navigation-categories', () => ({ fetchNavigationMeta: navigationMeta }));

const labels = {
  menu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  cart: 'Panier',
  language: 'Langue',
  home: 'Accueil',
  products: 'Produits',
  offers: 'Promos',
  categories: 'Catégories',
  brands: 'Marques',
  search: {
    label: 'Rechercher des produits', placeholder: 'Quel outil recherchez-vous ?', searching: 'Recherche…',
    results: 'Résultats', noResults: 'Aucun résultat', viewAll: 'Voir tout', inStock: 'En stock', outOfStock: 'Indisponible',
  },
  cartDrawer: {
    title: 'Votre panier', close: 'Fermer le panier', emptyTitle: 'Votre panier est vide',
    emptyDescription: 'Ajoutez des outils.', continueShopping: 'Voir les produits', subtotal: 'Sous-total',
    checkout: 'Passer la commande', quantity: 'Quantité', increase: 'Augmenter la quantité',
    decrease: 'Diminuer la quantité', remove: 'Retirer',
  },
  support: { title: 'Besoin d’aide ?', call: 'Appeler' },
};

const contact = {
  phoneDisplay: '0795 34 28 26', phoneHref: 'tel:+213795342826', phoneEnabled: true, aiAssistantEnabled: true,
};

describe('NavigationActions', () => {
  beforeEach(() => {
    analytics.mockClear();
    haptics.prepare.mockClear();
    haptics.trigger.mockClear();
    navigationMeta.mockResolvedValue({
      categories: [
        { id: 5, name: 'Équipement d’atelier', nameAr: null, slug: 'equipement-atelier', parentId: null },
        { id: 3, name: 'Éclairage', nameAr: null, slug: 'eclairage', parentId: 5 },
      ],
      brands: [{ id: 8, name: 'Wadfow', slug: 'wadfow' }],
    });
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
        contact={contact}
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
    expect(haptics.trigger).toHaveBeenCalledWith('navigation');
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
        contact={contact}
      />,
    );

    const cartButton = await screen.findByRole('button', { name: 'Panier: 3' });
    fireEvent.pointerDown(cartButton);
    fireEvent.click(cartButton);
    expect(screen.getByRole('dialog', { name: labels.cartDrawer.title })).toBeVisible();
    expect(screen.getByRole('link', { name: labels.cartDrawer.checkout })).toHaveAttribute('href', '/fr/checkout');
    expect(analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'view_cart', quantity: 3 }));
  });

  it('opens an accessible drawer with categories grouped beneath their parent and every brand', async () => {
    render(
      <NavigationActions
        locale="fr"
        alternateLocale="ar"
        alternateLabel="العربية"
        categories={[{ id: 3, label: 'Éclairage' }]}
        labels={labels}
        contact={contact}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: labels.menu }));
    fireEvent.click(screen.getByRole('button', { name: labels.menu }));
    const drawer = screen.getByRole('dialog', { name: labels.menu });
    expect(drawer).toBeVisible();
    expect(drawer.parentElement?.parentElement).toBe(document.body);
    await within(drawer).findByText('Équipement d’atelier', { selector: 'summary span' });
    const categoryGroups = drawer.querySelectorAll('.navigation-drawer-category-group');
    expect(categoryGroups).toHaveLength(1);
    const categoryGroup = categoryGroups[0];
    expect(within(categoryGroup).getByText('Équipement d’atelier', { selector: 'summary span' })).toBeVisible();
    fireEvent.click(categoryGroup.querySelector('summary')!);
    expect(within(categoryGroup).getByRole('link', { name: /Équipement d’atelier/ })).toHaveAttribute('href', '/fr/categories/equipement-atelier');
    expect(within(categoryGroup).getByRole('link', { name: /Éclairage/ })).toHaveAttribute('href', '/fr/categories/eclairage');
    expect(within(drawer).getByRole('link', { name: 'Promos' })).toHaveAttribute('href', '/fr/products?discounted=1');
    expect(screen.getByRole('link', { name: /Wadfow/ })).toHaveAttribute('href', '/fr/brands/wadfow');
    const categorySummary = within(drawer).getByText(labels.categories).closest('summary');
    expect(categorySummary?.querySelector('svg')).toBeInTheDocument();
    expect(haptics.trigger).toHaveBeenCalledWith('surface');
    haptics.trigger.mockClear();
    fireEvent.pointerDown(within(categoryGroup).getByRole('link', { name: /Éclairage/ }));
    expect(haptics.trigger).not.toHaveBeenCalled();
    const drawerLocaleToggle = within(drawer).getByRole('group', { name: labels.language });
    expect(drawerLocaleToggle).toHaveClass('navigation-drawer-locale-toggle');
    expect(drawerLocaleToggle).toHaveAttribute('data-selected', 'fr');
    expect(drawer.querySelector('.navigation-drawer-language')).toBeNull();
    expect(within(drawer).getByRole('link', { name: /Appeler.*0795 34 28 26/ })).toHaveAttribute('href', 'tel:+213795342826');
    expect(analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'navigation_menu_open' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: labels.menu })).not.toBeInTheDocument();
  });
});
