import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/fr/products/desk-lamp' }));
const resetMobilePageZoom = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next/dynamic', () => ({ default: () => () => <div role="dialog">Assistant</div> }));
vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: vi.fn() }));
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
  thinking: 'Recherche',
  error: 'Erreur',
  rateLimited: 'Patientez',
  fallback: 'Catalogue',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
  priceOnRequest: 'Sur demande',
  viewProduct: 'Voir',
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

  it('does not render in private conversion-completion routes', () => {
    state.pathname = '/ar/checkout';
    const { container, rerender } = render(
      <ShoppingAssistantLauncher locale="ar" labels={labels} />,
    );
    expect(container).toBeEmptyDOMElement();
    state.pathname = '/ar/thank-you';
    rerender(<ShoppingAssistantLauncher locale="ar" labels={labels} />);
    expect(container).toBeEmptyDOMElement();
  });
});
