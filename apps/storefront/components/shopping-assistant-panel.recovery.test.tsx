import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('restores local history and starts a new chat on request', async () => {
    localStorage.setItem(
      'bricomaitre-shopping-assistant-chat-v1:fr',
      JSON.stringify([
        {
          id: 'saved-1',
          role: 'assistant',
          content: 'Votre **ancienne réponse**.',
          products: [
            {
              ...product,
              sku: undefined,
              characteristics: undefined,
              characteristicsAr: undefined,
            },
          ],
        },
        {
          id: 'corrupt',
          role: 'assistant',
          content: 'Invalid saved product',
          products: [{ id: 'invalid' }],
        },
      ]),
    );
    vi.stubGlobal('fetch', vi.fn());

    render(<ShoppingAssistantPanel locale="fr" labels={labels} onClose={vi.fn()} />);

    expect(await screen.findByText('ancienne réponse', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Perceuse béton/ })).toHaveAttribute(
      'href',
      '/fr/products/perceuse-beton',
    );
    expect(screen.queryByText('Invalid saved product')).not.toBeInTheDocument();
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
      .mockResolvedValueOnce(Response.json({ message: 'La réponse relancée', products: [] }));
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
    const first = within(dialog).getByRole('button', { name: labels.newChat });
    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(screen.getByLabelText(labels.inputLabel)).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(first).toHaveFocus();
  });
});
