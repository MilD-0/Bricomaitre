import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/fr/products/desk-lamp' }));
const resetMobilePageZoom = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next/dynamic', () => ({ default: () => () => <div role="dialog">Assistant</div> }));
vi.mock('@/lib/analytics', () => ({
  getAnalyticsIdentity: () => ({ journeyId: 'journey-1', sessionId: 'session-1' }),
  trackNavigationEvent: vi.fn(),
}));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: vi.fn(), triggerHaptic: vi.fn() }));
vi.mock('@/lib/mobile-page-zoom', () => ({ resetMobilePageZoom }));

import { ShoppingAssistantLauncher } from './shopping-assistant-launcher';

const labels = {
  open: 'Trouver le bon outil',
  title: 'Conseiller produits',
  close: 'Fermer',
  liveCatalog: 'Catalogue',
  newChat: 'Nouvelle discussion',
  welcomeTitle: 'Projet',
  welcomeDescription: 'Besoin',
  placeholder: 'Question',
  inputLabel: 'Question',
  send: 'Envoyer',
  stop: 'Arrêter',
  stopped: 'Arrêtée',
  retry: 'Réessayer',
  thinking: 'Recherche',
  toolActivity: {
    search_catalog: 'Catalogue',
    inspect_products: 'Produits',
    inspect_order: 'Commande',
    inspect_delivery_support: 'Livraison',
    inspect_promotion: 'Promotion',
    manage_cart: 'Panier',
    present_products: 'Options',
  },
  toolRetrying: 'Nouvelle tentative',
  error: 'Erreur',
  interrupted: 'Réponse interrompue',
  rateLimited: 'Patientez',
  fallback: 'Catalogue',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
  priceOnRequest: 'Sur demande',
  viewProduct: 'Voir',
  cartUpdated: 'Panier mis à jour',
  helpful: 'Utile',
  notHelpful: 'À améliorer',
  quickPrompts: ['Un', 'Deux', 'Trois'],
};

describe('ShoppingAssistantLauncher', () => {
  afterEach(cleanup);

  it('moves above the mobile product purchase bar', () => {
    state.pathname = '/fr/products/desk-lamp';
    render(<ShoppingAssistantLauncher locale="fr" labels={labels} />);
    expect(screen.getByRole('button', { name: labels.open })).toHaveClass('is-product-detail');
  });

  it('resets browser pinch zoom before opening', () => {
    state.pathname = '/fr/products/desk-lamp';
    render(<ShoppingAssistantLauncher locale="fr" labels={labels} />);

    fireEvent.click(screen.getByRole('button', { name: labels.open }));

    expect(resetMobilePageZoom).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays available through checkout and order confirmation', () => {
    state.pathname = '/ar/checkout';
    const { container, rerender } = render(
      <ShoppingAssistantLauncher locale="ar" labels={labels} />,
    );
    expect(within(container).getByRole('button', { name: labels.open })).toBeInTheDocument();
    state.pathname = '/ar/thank-you';
    rerender(<ShoppingAssistantLauncher locale="ar" labels={labels} />);
    expect(within(container).getByRole('button', { name: labels.open })).toBeInTheDocument();
  });
});
