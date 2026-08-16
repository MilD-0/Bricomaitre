import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from './global-search';

const analytics = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const haptic = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: analytics }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: haptic }));
vi.mock('@/components/catalog-live-search', () => ({ getAdaptiveSearchDelay: () => 0 }));

const labels = {
  label: 'Rechercher des produits',
  placeholder: 'Quel outil recherchez-vous ?',
  searching: 'Recherche en cours…',
  results: 'Suggestions de produits',
  noResults: 'Aucun produit trouvé',
  viewAll: 'Voir tous les résultats',
  inStock: 'En stock',
  outOfStock: 'Indisponible',
};

describe('GlobalSearch', () => {
  beforeEach(() => {
    analytics.mockClear();
    haptic.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 12,
                slug: 'desk-lamp',
                mongoId: null,
                title: 'Lampe de travail',
                titleAr: 'مصباح العمل',
                price: '4500.00',
                inStock: true,
                images: ['/product-placeholder.svg'],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('debounces suggestions and records governed selection telemetry', async () => {
    render(<GlobalSearch locale="fr" labels={labels} />);
    const input = screen.getByRole('combobox', { name: labels.label });

    fireEvent.change(input, { target: { value: 'per' } });
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/catalog?q=per', expect.any(Object)),
    );
    expect(await screen.findByText('Lampe de travail')).toBeVisible();
    expect(screen.getByText(/4.*500.*DA/)).toBeVisible();
    expect(analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'search',
        searchTerm: 'per',
        metadata: { surface: 'global_search', resultsCount: 1 },
      }),
    );

    fireEvent.click(screen.getByRole('link', { name: /Lampe de travail/ }));
    expect(haptic).toHaveBeenCalledWith('navigation');
    expect(analytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'select_item',
        productId: 12,
      }),
    );
  });

  it('does not request suggestions for a one-character query', () => {
    render(<GlobalSearch locale="fr" labels={labels} />);
    fireEvent.change(screen.getByRole('combobox', { name: labels.label }), {
      target: { value: 'p' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps result rows stable with skeletons while suggestions are in flight', async () => {
    let resolveResponse: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    render(<GlobalSearch locale="fr" labels={labels} />);

    fireEvent.change(screen.getByRole('combobox', { name: labels.label }), {
      target: { value: 'per' },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(document.querySelector('.global-search-skeleton')).toBeInTheDocument();

    resolveResponse!(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await waitFor(() =>
      expect(document.querySelector('.global-search-skeleton')).not.toBeInTheDocument(),
    );
  });
});
