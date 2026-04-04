import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./image-upload-field', () => ({
  ImageUploadField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string[];
    onChange: (urls: string[]) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value[0] ?? ''}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    </label>
  ),
}));

import { toast } from '../lib/toast';
import messages from '../messages/en.json';
import { server } from '../test/mocks/server';
import { AssetsManager } from './assets-manager';
import { Toaster } from './ui/toaster';

describe('AssetsManager', () => {
  const createCalls: Array<{ kind: string; data: unknown }> = [];
  const updateCalls: Array<{ url: string; body: unknown }> = [];
  const patchCalls: Array<{ url: string; body: unknown }> = [];
  const reorderCalls: Array<{ kind: string; items: Array<{ id: number; sortOrder: number }> }> = [];

  beforeEach(() => {
    createCalls.length = 0;
    updateCalls.length = 0;
    patchCalls.length = 0;
    reorderCalls.length = 0;

    server.use(
      http.get('/api/assets', () =>
        HttpResponse.json({
          banners: [
            {
              id: 1,
              title: 'Existing banner',
              imageUrl: 'https://cdn.example.com/banner-1.jpg',
              productId: 10,
              sortOrder: 0,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          featuredGroups: [
            {
              id: 2,
              name: 'Summer carousel',
              cta: null,
              link: null,
              productIds: [10],
              brandIds: [],
              categoryIds: [200],
              sortOrder: 0,
              showAtTopOfProductsPage: false,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-03T00:00:00.000Z',
            },
          ],
          productCards: [
            {
              id: 3,
              productId: 10,
              titleAr: 'بطاقة',
              titleFr: 'Carte',
              descriptionAr: 'وصف قصير',
              descriptionFr: 'Description courte',
              characteristicsAr: ['واحد', 'اثنان', 'ثلاثة'],
              characteristicsFr: ['Un', 'Deux', 'Trois'],
              sortOrder: 0,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-04T00:00:00.000Z',
            },
          ],
        }),
      ),
      http.get('/api/assets/meta', () =>
        HttpResponse.json({
          products: [{ id: 10, title: 'Roller', slug: 'roller', brandId: 100, categoryId: 200, images: ['https://cdn.example.com/product-1.jpg'] }],
          brands: [{ id: 100, name: 'Acme' }],
          categories: [{ id: 200, name: 'Paint' }],
        }),
      ),
      http.post('/api/assets', async ({ request }) => {
        await delay(50);
        const body = (await request.json()) as { kind: string; data: unknown };
        createCalls.push(body);
        return HttpResponse.json({ ok: true });
      }),
      http.put('/api/assets/:kind/:id', async ({ request }) => {
        await delay(50);
        updateCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/assets/:kind/:id', async ({ request }) => {
        await delay(50);
        patchCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/assets/reorder', async ({ request }) => {
        await delay(50);
        reorderCalls.push(await request.json() as { kind: string; items: Array<{ id: number; sortOrder: number }> });
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/assets/:kind/:id', () => HttpResponse.json({ ok: true })),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
    vi.restoreAllMocks();
  });

  function renderAssetsManager() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <AssetsManager />
          <Toaster />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('creates a banner from the dialog flow', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    await userEvent.click(screen.getByRole('button', { name: 'New banner' }));
    const bannerDialog = screen.getByRole('dialog');
    await userEvent.type(within(bannerDialog).getByRole('textbox', { name: 'Title' }), 'Hero banner');
    await userEvent.click(within(bannerDialog).getByRole('button', { name: 'Choose Roller' }));
    await userEvent.type(within(bannerDialog).getByRole('textbox', { name: 'Banner image' }), 'https://cdn.example.com/new-banner.jpg');
    await userEvent.click(within(bannerDialog).getByRole('button', { name: 'Create banner' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(createCalls).toContainEqual({
        kind: 'banner',
          data: {
            title: 'Hero banner',
            imageUrl: 'https://cdn.example.com/new-banner.jpg',
            productId: 10,
            active: true,
        },
      });
    });
  });

  it('shows a visible loading state before the assets payload resolves', async () => {
    server.use(
      http.get('/api/assets', async () => {
        await delay(150);
        return HttpResponse.json({ banners: [], featuredGroups: [], productCards: [] });
      }),
      http.get('/api/assets/meta', async () => {
        await delay(150);
        return HttpResponse.json({ products: [], brands: [], categories: [] });
      }),
    );

    renderAssetsManager();

    expect(screen.getAllByRole('heading', { name: /banner|group|card/i }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows a recoverable error state when the assets request fails', async () => {
    server.use(
      http.get('/api/assets', () => HttpResponse.text('Assets failed', { status: 500 })),
      http.get('/api/assets/meta', () => HttpResponse.json({ products: [], brands: [], categories: [] })),
    );

    renderAssetsManager();

    expect(await screen.findByText('Assets failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('edits a product card from the dialog flow', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    const cardsSection = screen.getByText('Product cards').closest('section') as HTMLElement;
    await userEvent.click(within(cardsSection).getByRole('button', { name: 'Edit' }));
    const cardDialog = screen.getByRole('dialog');
    expect(within(cardDialog).getAllByRole('button', { name: 'Remove Roller' })[0]).toBeInTheDocument();
    expect(within(cardDialog).getAllByAltText('Roller')[0]).toBeInTheDocument();
    await userEvent.clear(within(cardDialog).getByRole('textbox', { name: 'French title' }));
    await userEvent.type(within(cardDialog).getByRole('textbox', { name: 'French title' }), 'Carte mise a jour');
    await userEvent.click(within(cardDialog).getByRole('button', { name: 'Update card' }));

    await screen.findByText('Saved card for Roller.');

    await waitFor(() => {
      expect(updateCalls).toContainEqual({
        url: 'http://localhost:3000/api/assets/product-card/3',
        body: {
          data: {
            productId: 10,
            titleAr: 'بطاقة',
            titleFr: 'Carte mise a jour',
            descriptionAr: 'وصف قصير',
            descriptionFr: 'Description courte',
            characteristicsAr: ['واحد', 'اثنان', 'ثلاثة'],
            characteristicsFr: ['Un', 'Deux', 'Trois'],
            active: true,
          },
        },
      });
    });
  });

  it('keeps spaces while typing card characteristics', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    const cardsSection = screen.getByText('Product cards').closest('section') as HTMLElement;
    await userEvent.click(within(cardsSection).getByRole('button', { name: 'Edit' }));
    const cardDialog = screen.getByRole('dialog');
    const frenchCharacteristics = within(cardDialog).getByRole('textbox', { name: 'French characteristics' });

    await userEvent.clear(frenchCharacteristics);
    await userEvent.type(frenchCharacteristics, 'Heavy duty motor');

    expect(frenchCharacteristics).toHaveValue('Heavy duty motor');
    expect(within(cardDialog).queryByText('Too small: expected array to have >=3 items')).not.toBeInTheDocument();
  });

  it('shows the characteristics minimum error only after submit', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    const cardsSection = screen.getByText('Product cards').closest('section') as HTMLElement;
    await userEvent.click(within(cardsSection).getByRole('button', { name: 'Edit' }));
    const cardDialog = screen.getByRole('dialog');
    const frenchCharacteristics = within(cardDialog).getByRole('textbox', { name: 'French characteristics' });

    await userEvent.clear(frenchCharacteristics);
    await userEvent.type(frenchCharacteristics, 'Heavy duty motor');

    expect(within(cardDialog).queryByText('Too small: expected array to have >=3 items')).not.toBeInTheDocument();

    await userEvent.click(within(cardDialog).getByRole('button', { name: 'Update card' }));

    expect(await within(cardDialog).findByText('Too small: expected array to have >=3 items')).toBeInTheDocument();
  });

  it('lets featured-group selections be added and removed cleanly before validation', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    await userEvent.click(screen.getByRole('button', { name: 'New group' }));
    const groupDialog = screen.getByRole('dialog');
    await userEvent.type(within(groupDialog).getByRole('textbox', { name: 'Group name' }), 'Empty group');
    expect(within(groupDialog).getByText('roller')).toBeInTheDocument();
    await userEvent.click(within(groupDialog).getByRole('button', { name: 'Add Roller' }));
    await userEvent.click(within(groupDialog).getAllByRole('button', { name: 'Remove Roller' })[0]);
    await userEvent.click(within(groupDialog).getByRole('button', { name: 'Create group' }));

    expect(await within(groupDialog).findByText('Select at least one product, brand, or category.')).toBeInTheDocument();
    expect(createCalls).toHaveLength(0);
  });

  it('creates a featured group with storefront top placement enabled', async () => {
    renderAssetsManager();

    await screen.findByText('Existing banner');

    await userEvent.click(screen.getByRole('button', { name: 'New group' }));
    const groupDialog = screen.getByRole('dialog');
    await userEvent.type(within(groupDialog).getByRole('textbox', { name: 'Group name' }), 'Homepage picks');
    await userEvent.type(within(groupDialog).getByRole('textbox', { name: 'CTA text' }), 'Voir Plus');
    await userEvent.type(within(groupDialog).getByRole('textbox', { name: 'CTA link' }), '/products?featured=1');
    await userEvent.click(within(groupDialog).getByRole('switch', { name: 'Show at top of products page' }));
    await userEvent.click(within(groupDialog).getByRole('button', { name: 'Add Roller' }));
    await userEvent.click(within(groupDialog).getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      expect(createCalls).toContainEqual({
        kind: 'featuredGroup',
        data: {
          name: 'Homepage picks',
          cta: 'Voir Plus',
          link: '/products?featured=1',
          productIds: [10],
          brandIds: [],
          categoryIds: [],
          showAtTopOfProductsPage: true,
          active: true,
        },
      });
    });
  });

  it('restores the banner status switch when activation fails', async () => {
    server.use(
      http.patch('/api/assets/banner/:id', async () => {
        await delay(50);
        return new HttpResponse('broken', { status: 500 });
      }),
    );

    renderAssetsManager();

    await screen.findByText('Existing banner');

    const bannersSection = screen.getByText('Banners').closest('section') as HTMLElement;
    const bannerSwitch = within(bannersSection).getByRole('switch', { name: 'Status' });

    expect(bannerSwitch).toHaveAttribute('data-state', 'checked');
    await userEvent.click(bannerSwitch);
    expect(bannerSwitch).toHaveAttribute('data-state', 'unchecked');

    await waitFor(() => {
      expect(bannerSwitch).toHaveAttribute('data-state', 'checked');
    });
    await screen.findByText('Failed to deactivate banner Existing banner.');
  });

  it('toggles featured group storefront top placement from the table', async () => {
    renderAssetsManager();

    await screen.findByText('Summer carousel');

    const groupsSection = screen.getByText('Featured product groups').closest('section') as HTMLElement;
    const placementSwitch = within(groupsSection).getByRole('switch', { name: 'Toggle top placement for Summer carousel' });

    expect(placementSwitch).toHaveAttribute('data-state', 'unchecked');
    await userEvent.click(placementSwitch);

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/assets/featured-group/2',
        body: {
          showAtTopOfProductsPage: true,
        },
      });
    });

    await screen.findByText('Pinned featured group Summer carousel to the top of the products page.');
  });

  it('persists row reordering across banners, groups, and cards', async () => {
    server.use(
      http.get('/api/assets', () =>
        HttpResponse.json({
          banners: [
            {
              id: 1,
              title: 'Existing banner',
              imageUrl: 'https://cdn.example.com/banner-1.jpg',
              productId: 10,
              sortOrder: 0,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 4,
              title: 'Secondary banner',
              imageUrl: 'https://cdn.example.com/banner-2.jpg',
              productId: null,
              sortOrder: 1,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          featuredGroups: [
            {
              id: 2,
              name: 'Summer carousel',
              cta: null,
              link: null,
              productIds: [10],
              brandIds: [],
              categoryIds: [200],
              sortOrder: 0,
              showAtTopOfProductsPage: false,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-03T00:00:00.000Z',
            },
            {
              id: 5,
              name: 'Top sellers',
              cta: null,
              link: null,
              productIds: [],
              brandIds: [100],
              categoryIds: [],
              sortOrder: 1,
              showAtTopOfProductsPage: true,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-03T00:00:00.000Z',
            },
          ],
          productCards: [
            {
              id: 3,
              productId: 10,
              titleAr: 'بطاقة',
              titleFr: 'Carte',
              descriptionAr: 'وصف قصير',
              descriptionFr: 'Description courte',
              characteristicsAr: ['واحد', 'اثنان', 'ثلاثة'],
              characteristicsFr: ['Un', 'Deux', 'Trois'],
              sortOrder: 0,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-04T00:00:00.000Z',
            },
            {
              id: 6,
              productId: 10,
              titleAr: 'بطاقة ثانية',
              titleFr: 'Carte secondaire',
              descriptionAr: 'وصف ثاني',
              descriptionFr: 'Description secondaire',
              characteristicsAr: ['أ', 'ب', 'ج'],
              characteristicsFr: ['A', 'B', 'C'],
              sortOrder: 1,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-04T00:00:00.000Z',
            },
          ],
        }),
      ),
    );

    renderAssetsManager();

    await screen.findByText('Secondary banner');

    await userEvent.click(screen.getByRole('button', { name: 'Move Secondary banner up' }));
    await waitFor(() => {
      expect(reorderCalls).toHaveLength(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Move Top sellers up' }));
    await waitFor(() => {
      expect(reorderCalls).toHaveLength(2);
    });

    const cardsSection = screen.getByText('Product cards').closest('section') as HTMLElement;
    await userEvent.click(within(cardsSection).getAllByRole('button', { name: 'Move Roller up' })[1]);

    await waitFor(() => {
      expect(reorderCalls).toEqual([
        {
          kind: 'banner',
          items: [
            { id: 4, sortOrder: 0 },
            { id: 1, sortOrder: 1 },
          ],
        },
        {
          kind: 'featured-group',
          items: [
            { id: 5, sortOrder: 0 },
            { id: 2, sortOrder: 1 },
          ],
        },
        {
          kind: 'product-card',
          items: [
            { id: 6, sortOrder: 0 },
            { id: 3, sortOrder: 1 },
          ],
        },
      ]);
    });
  });
});
