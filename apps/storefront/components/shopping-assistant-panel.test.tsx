import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_CART_KEY } from '../lib/cart';
import { ShoppingAssistantPanel, type ShoppingAssistantLabels } from './shopping-assistant-panel';

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
    read_storefront_guidance: 'Informations Bricomaitre…',
    search_catalog: 'Recherche catalogue…',
    inspect_products: 'Vérification produits…',
    inspect_order: 'Vérification commande…',
    inspect_delivery_support: 'Vérification livraison…',
    inspect_promotion: 'Vérification promotion…',
    manage_cart: 'Mise à jour panier…',
    present_products: 'Préparation options…',
  },
  toolFailed: 'Données indisponibles…',
  error: 'Indisponible',
  interrupted: 'Réponse interrompue',
  rateLimited: 'Patientez',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
  priceOnRequest: 'Prix sur demande',
  viewProduct: 'Voir',
  addToCart: 'Ajouter au panier',
  addedToCart: 'Ajouté',
  cartUpdated: 'Panier mis à jour',
  helpful: 'Réponse utile',
  notHelpful: 'Réponse à améliorer',
  quickPrompts: ['Une perceuse', 'Comparer', 'Disponible'],
};

const product = {
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
          message:
            'Voici une **option** du catalogue.\n\n- Adaptée au béton\n- Disponible en stock',
          products: [product],
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
      messages: [{ role: 'user', content: 'Une perceuse pour le béton' }],
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/',
      },
    });
    expect(behavior.analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ai_assistant_message',
        metadata: { surface: 'ai_assistant', target: 'submitted' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: labels.helpful }));
    expect(behavior.analytics).toHaveBeenCalledWith({
      eventName: 'ai_assistant_feedback',
      locale: 'fr',
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

  it.each(['manual', 'assistant'])('does not confirm a failed %s cart write', async (source) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          message: 'Voici le produit.',
          products: [product],
          cartMutations: source === 'assistant' ? [{ action: 'add', quantity: 1, product }] : [],
        }),
      ),
    );
    const nativeSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === STOREFRONT_CART_KEY)
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      nativeSetItem.call(this, key, value);
    });
    const cartUpdated = vi.fn();
    window.addEventListener('bric:cart-updated', cartUpdated);
    try {
      render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Une perceuse' }));
      await screen.findByText('Voici le produit.');
      await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).toBeEnabled());
      if (source === 'manual')
        fireEvent.click(screen.getByRole('button', { name: labels.addToCart }));
      expect(localStorage.getItem(STOREFRONT_CART_KEY)).toBeNull();
      expect(cartUpdated).not.toHaveBeenCalled();
      expect(screen.queryByText(labels.cartUpdated)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: labels.addedToCart })).not.toBeInTheDocument();
      expect(behavior.haptic).not.toHaveBeenCalledWith('success');
      expect(behavior.analytics).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'add_to_cart' }),
      );
    } finally {
      write.mockRestore();
      window.removeEventListener('bric:cart-updated', cartUpdated);
    }
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
          '{"type":"text-delta","delta":" immédiate."}\n{"type":"result","products":[]}\n',
        ),
      );
      streamController!.close();
    });
    expect(await screen.findByText('Première réponse immédiate.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).not.toBeDisabled());
  });

  it('applies an assistant cart result once through the native local cart', async () => {
    localStorage.setItem(
      STOREFRONT_CART_KEY,
      JSON.stringify([
        {
          productId: 12,
          token: 'perceuse-beton',
          title: 'Perceuse béton',
          imageUrl: null,
          unitPrice: 12_500,
          quantity: 1,
          availabilityStatus: 'in_stock',
        },
      ]),
    );
    const cartUpdated = vi.fn();
    window.addEventListener('bric:cart-updated', cartUpdated);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          message: 'La quantité est maintenant de trois.',
          products: [],
          cartMutations: [
            {
              action: 'set_quantity',
              productId: 12,
              quantity: 3,
            },
          ],
        }),
      ),
    );
    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(labels.inputLabel), {
      target: { value: 'Passe la quantité de cette perceuse à 3.' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));

    expect(await screen.findByText(labels.cartUpdated)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STOREFRONT_CART_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ productId: 12, quantity: 3 }),
    ]);
    expect(cartUpdated).toHaveBeenCalledTimes(1);
    expect(behavior.analytics).toHaveBeenCalledWith({
      eventName: 'add_to_cart',
      locale: 'fr',
      productId: 12,
      productSlug: 'perceuse-beton',
      quantity: 2,
      value: 25_000,
      metadata: { surface: 'ai_assistant', target: 'cart_set_quantity' },
    });
    window.removeEventListener('bric:cart-updated', cartUpdated);
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
      .mockResolvedValueOnce(Response.json({ message: 'Nouvelle réponse complète', products: [] }));
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
          '{"type":"text-delta","delta":"J’ai trouvé une option."}\n{"type":"result","products":[]}\n',
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
      .mockResolvedValue(Response.json({ message: 'Réponse continue', products: [] }));
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
});
