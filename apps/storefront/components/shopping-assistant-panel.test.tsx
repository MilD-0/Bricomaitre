import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShoppingAssistantPanel, type ShoppingAssistantLabels } from './shopping-assistant-panel';
import { STOREFRONT_CART_KEY } from '../lib/cart';

const behavior = vi.hoisted(() => ({ analytics: vi.fn(), haptic: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  getAnalyticsIdentity: () => ({
    visitId: 'visit-1',
    journeyId: 'journey-1',
    sessionId: 'session-1',
  }),
  trackNavigationEvent: behavior.analytics,
}));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: behavior.haptic }));

const labels: ShoppingAssistantLabels = {
  open: 'Trouver le bon outil',
  title: 'Conseiller produits',
  close: 'Fermer',
  liveCatalog: 'Catalogue en direct',
  newChat: 'Nouvelle discussion',
  welcomeTitle: 'Quel projet ?',
  welcomeDescription: 'Décrivez votre besoin.',
  placeholder: 'Votre question',
  inputLabel: 'Question produit',
  send: 'Envoyer',
  thinking: 'Recherche…',
  error: 'Indisponible',
  rateLimited: 'Patientez',
  fallback: 'Résultats du catalogue',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
  priceOnRequest: 'Prix sur demande',
  viewProduct: 'Voir',
  addToCart: 'Ajouter au panier',
  addedToCart: 'Ajouté',
  quickPrompts: ['Une perceuse', 'Comparer', 'Disponible'],
};

describe('ShoppingAssistantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${Math.random()}`) });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('submits a bounded conversation and renders grounded product results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mode: 'ai',
          message:
            'Voici une **option** du catalogue.\n\n- Adaptée au béton\n- Disponible en stock',
          products: [
            {
              id: 12,
              token: 'perceuse-beton',
              title: 'Perceuse béton',
              titleAr: 'مثقاب خرسانة',
              description: null,
              descriptionAr: null,
              price: '12500.00',
              oldPrice: null,
              inStock: true,
              availabilityStatus: 'in_stock',
              imageUrl: null,
              brand: 'Bric Pro',
              category: 'Perçage',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(labels.inputLabel), {
      target: { value: 'Une perceuse pour le béton' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    expect(await screen.findByText('option', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Adaptée au béton', { selector: 'li' })).toBeInTheDocument();
    const result = screen.getByRole('link', { name: /Perceuse béton/ });
    expect(result).toHaveAttribute('href', '/fr/products/perceuse-beton');
    fireEvent.click(screen.getByRole('button', { name: labels.addToCart }));
    expect(screen.getByRole('button', { name: labels.addedToCart })).toBeInTheDocument();
    expect(localStorage.getItem(STOREFRONT_CART_KEY)).toContain('perceuse-beton');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      locale: 'fr',
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/',
        intent: 'other',
      },
      messages: [{ role: 'user', content: 'Une perceuse pour le béton' }],
    });
    expect(behavior.analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ai_assistant_message',
        metadata: { surface: 'ai_assistant', target: 'submitted', intent: 'other' },
      }),
    );
    expect(JSON.stringify(behavior.analytics.mock.calls)).not.toContain(
      'Une perceuse pour le béton',
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('bricomaitre-shopping-assistant-chat-v1:fr') ?? '[]'),
      ).toHaveLength(2),
    );
  });

  it('renders the first assistant text chunk before the response finishes', async () => {
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            '{"type":"status","status":"thinking"}\n{"type":"text-delta","delta":"Première réponse"}\n',
          ),
        );
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }),
        ),
    );
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(labels.inputLabel), { target: { value: 'Une lampe' } });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    expect(await screen.findByText('Première réponse')).toBeInTheDocument();
    expect(screen.queryByText(labels.thinking)).not.toBeInTheDocument();
    await act(async () => {
      streamController!.enqueue(
        encoder.encode(
          '{"type":"text-delta","delta":" immédiate."}\n{"type":"result","mode":"ai","products":[]}\n',
        ),
      );
      streamController!.close();
    });
    expect(await screen.findByText('Première réponse immédiate.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).not.toBeDisabled());
  });

  it('restores local history and starts a new chat on request', async () => {
    localStorage.setItem(
      'bricomaitre-shopping-assistant-chat-v1:fr',
      JSON.stringify([
        { id: 'saved-1', role: 'assistant', content: 'Votre **ancienne réponse**.' },
      ]),
    );
    vi.stubGlobal('fetch', vi.fn());

    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    expect(await screen.findByText('ancienne réponse', { selector: 'strong' })).toBeInTheDocument();
    const newChat = screen.getByRole('button', { name: labels.newChat });
    expect(newChat.closest('.mobile-sheet-header')).not.toBeNull();
    expect(newChat.closest('.shopping-assistant-intro')).toBeNull();
    fireEvent.click(newChat);
    expect(screen.queryByText('ancienne réponse')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem('bricomaitre-shopping-assistant-chat-v1:fr')).toBeNull(),
    );
  });

  it('shows a recoverable localized rate-limit state without losing the question', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Une perceuse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.rateLimited);
    expect(screen.getByText('Une perceuse')).toBeInTheDocument();
    expect(behavior.analytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'ai_assistant_error' }),
    );
  });

  it('renders the Arabic surface and keeps the sheet keyboard accessible', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(
      <ShoppingAssistantPanel
        locale="ar"
        labels={{ ...labels, title: 'مستشار المنتجات' }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'مستشار المنتجات' });
    expect(within(dialog).getByRole('button', { name: labels.close })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).toHaveFocus());
  });
});
