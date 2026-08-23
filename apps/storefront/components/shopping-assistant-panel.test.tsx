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
  stop: 'Arrêter',
  stopped: 'Réponse arrêtée',
  retry: 'Réessayer',
  thinking: 'Recherche…',
  toolActivity: {
    search_catalog: 'Recherche catalogue…',
    inspect_products: 'Vérification produits…',
    inspect_order: 'Vérification commande…',
    inspect_delivery_support: 'Vérification livraison…',
    inspect_promotion: 'Vérification promotion…',
    present_products: 'Préparation options…',
  },
  toolRetrying: 'Nouvelle tentative…',
  error: 'Indisponible',
  interrupted: 'Réponse interrompue',
  rateLimited: 'Patientez',
  fallback: 'Résultats du catalogue',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
  priceOnRequest: 'Prix sur demande',
  viewProduct: 'Voir',
  addToCart: 'Ajouter au panier',
  addedToCart: 'Ajouté',
  helpful: 'Réponse utile',
  notHelpful: 'Réponse à améliorer',
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
              sku: 'PB-1',
              characteristics: ['Mandrin 13 mm'],
              characteristicsAr: ['ظرف 13 مم'],
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
      context: {
        pathname: '/',
        currentProductToken: null,
        currentLandingPageSlug: null,
        currentOrderToken: null,
        catalogQuery: null,
        cartItems: [],
      },
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
        searchTerm: 'Une perceuse pour le béton',
        metadata: { surface: 'ai_assistant', target: 'submitted', intent: 'other' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: labels.helpful }));
    expect(behavior.analytics).toHaveBeenCalledWith({
      eventName: 'ai_assistant_feedback',
      locale: 'fr',
      searchTerm: 'Voici une **option** du catalogue.\n\n- Adaptée au béton\n- Disponible en stock',
      metadata: {
        surface: 'ai_assistant',
        target: 'assistant_response',
        messageId: expect.any(String),
        rating: 'helpful',
      },
    });
    expect(screen.getByRole('button', { name: labels.helpful })).toHaveAttribute(
      'aria-pressed',
      'true',
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

  it('keeps interrupted partial text visibly incomplete and unavailable for feedback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          [
            JSON.stringify({ type: 'text-delta', delta: 'Cette perceuse est' }),
            JSON.stringify({
              type: 'error',
              code: 'assistant_unavailable',
              products: [],
            }),
            '',
          ].join('\n'),
          { headers: { 'content-type': 'application/x-ndjson' } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ mode: 'ai', message: 'Nouvelle réponse complète', products: [] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(labels.inputLabel), {
      target: { value: 'Une perceuse' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    expect(await screen.findByText('Cette perceuse est')).toBeInTheDocument();
    expect(await screen.findByText(labels.interrupted)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.error);
    expect(screen.queryByRole('button', { name: labels.helpful })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('bricomaitre-shopping-assistant-chat-v1:fr') ?? '[]'),
      ).toContainEqual(expect.objectContaining({ interrupted: true })),
    );

    fireEvent.change(screen.getByLabelText(labels.inputLabel), {
      target: { value: 'Une autre question' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));
    expect(await screen.findByText('Nouvelle réponse complète')).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Une perceuse' }),
      expect.objectContaining({ role: 'user', content: 'Une autre question' }),
    ]);
  });

  it('shows the exact live Storefront tool activity before the answer starts', async () => {
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            '{"type":"status","status":"thinking"}\n{"type":"tool","name":"search_catalog","status":"started"}\n',
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

    fireEvent.change(screen.getByLabelText(labels.inputLabel), {
      target: { value: 'Une perceuse pour le béton' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    const activity = await screen.findByText(labels.toolActivity.search_catalog);
    expect(activity.closest('[data-activity="search_catalog"]')).toHaveAttribute(
      'data-phase',
      'started',
    );
    await act(async () => {
      streamController!.enqueue(
        encoder.encode('{"type":"tool","name":"search_catalog","status":"completed"}\n'),
      );
    });
    await waitFor(() =>
      expect(activity.closest('[data-activity="search_catalog"]')).toHaveAttribute(
        'data-phase',
        'completed',
      ),
    );
    await act(async () => {
      streamController!.enqueue(
        encoder.encode(
          '{"type":"text-delta","delta":"J’ai trouvé une option."}\n{"type":"result","mode":"ai","products":[]}\n',
        ),
      );
      streamController!.close();
    });
    expect(await screen.findByText('J’ai trouvé une option.')).toBeInTheDocument();
    expect(screen.queryByText(labels.toolActivity.search_catalog)).not.toBeInTheDocument();
  });

  it('carries forty recent turns into the next answer', async () => {
    localStorage.setItem(
      'bricomaitre-shopping-assistant-chat-v1:fr',
      JSON.stringify(
        Array.from({ length: 40 }, (_, index) => ({
          id: `saved-${index + 1}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `history-${index + 1}`,
        })),
      ),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ mode: 'ai', message: 'Réponse continue', products: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    expect(await screen.findByText('history-40')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(labels.inputLabel), { target: { value: 'continue' } });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));
    await screen.findByText('Réponse continue');

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages).toHaveLength(40);
    expect(body.messages[0]).toMatchObject({ content: 'history-2' });
    expect(body.messages.at(-1)).toMatchObject({ role: 'user', content: 'continue' });
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

  it('retries a rate-limited question without duplicating it in the conversation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({ mode: 'ai', message: 'La réponse relancée', products: [] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Une perceuse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.rateLimited);
    expect(screen.getByText('Une perceuse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labels.retry }));
    expect(await screen.findByText('La réponse relancée')).toBeInTheDocument();
    expect(screen.getAllByText('Une perceuse')).toHaveLength(1);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Une perceuse' }),
    ]);
    expect(behavior.analytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'ai_assistant_error' }),
    );
    expect(behavior.analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ai_assistant_message',
        metadata: expect.objectContaining({ target: 'retry' }),
      }),
    );
  });

  it('lets the shopper stop an in-progress response and keep the question for retry', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Une perceuse' }));
    const stop = await screen.findByRole('button', { name: labels.stop });
    fireEvent.click(stop);

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.stopped);
    expect(screen.getByText('Une perceuse')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toMatchObject({ aborted: true });
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
