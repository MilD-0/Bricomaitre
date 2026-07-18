import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShoppingAssistantPanel, type ShoppingAssistantLabels } from './shopping-assistant-panel';

const behavior = vi.hoisted(() => ({ analytics: vi.fn(), haptic: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: behavior.analytics }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: behavior.haptic }));

const labels: ShoppingAssistantLabels = {
  open: 'Trouver le bon outil', title: 'Conseiller produits', close: 'Fermer', liveCatalog: 'Catalogue en direct',
  welcomeTitle: 'Quel projet ?', welcomeDescription: 'Décrivez votre besoin.', placeholder: 'Votre question',
  inputLabel: 'Question produit', send: 'Envoyer', thinking: 'Recherche…', error: 'Indisponible',
  rateLimited: 'Patientez', fallback: 'Résultats du catalogue', inStock: 'En stock', outOfStock: 'Indisponible',
  priceOnRequest: 'Prix sur demande', viewProduct: 'Voir', quickPrompts: ['Une perceuse', 'Comparer', 'Disponible'],
};

describe('ShoppingAssistantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${Math.random()}`) });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('submits a bounded conversation and renders grounded product results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      mode: 'ai',
      message: 'Voici une option du catalogue.',
      products: [{
        id: 12, token: 'perceuse-beton', title: 'Perceuse béton', titleAr: 'مثقاب خرسانة',
        description: null, descriptionAr: null, price: '12500.00', oldPrice: null, inStock: true,
        availabilityStatus: 'in_stock', imageUrl: null, brand: 'Bric Pro', category: 'Perçage',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(labels.inputLabel), { target: { value: 'Une perceuse pour le béton' } });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    expect(await screen.findByText('Voici une option du catalogue.')).toBeInTheDocument();
    const result = screen.getByRole('link', { name: /Perceuse béton/ });
    expect(result).toHaveAttribute('href', '/fr/products/perceuse-beton');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse pour le béton' }] });
    expect(behavior.analytics).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'ai_assistant_message',
      metadata: { surface: 'ai_assistant', target: 'submitted' },
    }));
    expect(JSON.stringify(behavior.analytics.mock.calls)).not.toContain('Une perceuse pour le béton');
  });

  it('shows a recoverable localized rate-limit state without losing the question', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Une perceuse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.rateLimited);
    expect(screen.getByText('Une perceuse')).toBeInTheDocument();
    expect(behavior.analytics).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'ai_assistant_error' }));
  });

  it('renders the Arabic surface and keeps the sheet keyboard accessible', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<ShoppingAssistantPanel locale="ar" labels={{ ...labels, title: 'مستشار المنتجات' }} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'مستشار المنتجات' });
    expect(within(dialog).getByRole('button', { name: labels.close })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).toHaveFocus());
  });
});
