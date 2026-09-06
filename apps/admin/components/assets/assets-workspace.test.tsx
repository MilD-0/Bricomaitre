import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetsResponse } from '../../lib/assets';
import { toast } from '../../lib/toast';
import { server } from '../../test/mocks/server';
import { AssetsWorkspace } from './assets-workspace';

vi.mock('../image-upload-field', () => ({
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

const assets: AssetsResponse = {
  banners: [
    {
      id: 1,
      title: 'Workshop campaign',
      titleAr: 'حملة الورشة',
      imageUrl: 'https://cdn.example.com/banner.jpg',
      imageUrlLandscape: 'https://cdn.example.com/banner.jpg',
      imageUrlPortrait: 'https://cdn.example.com/banner-mobile.jpg',
      productId: 10,
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    },
    {
      id: 2,
      title: 'Second campaign',
      titleAr: 'الحملة الثانية',
      imageUrl: 'https://cdn.example.com/banner-2.jpg',
      imageUrlLandscape: 'https://cdn.example.com/banner-2.jpg',
      imageUrlPortrait: 'https://cdn.example.com/banner-2-mobile.jpg',
      productId: null,
      active: false,
      sortOrder: 1,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
  ],
  featuredGroups: [
    {
      id: 3,
      name: 'Workshop tools',
      nameAr: 'أدوات الورشة',
      cta: 'Voir plus',
      ctaAr: 'عرض المزيد',
      link: '/products',
      productIds: [10],
      brandIds: [20],
      categoryIds: [],
      prioritizeRecommendations: false,
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    },
  ],
  productCards: [
    {
      id: 4,
      productId: 10,
      titleFr: 'Perceuse fiable',
      titleAr: 'مثقاب موثوق',
      descriptionFr: 'Pour les travaux quotidiens.',
      descriptionAr: 'للأعمال اليومية.',
      characteristicsFr: ['Solide', 'Compacte', 'Pratique'],
      characteristicsAr: ['متين', 'مدمج', 'عملي'],
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    },
  ],
};

function renderWorkspace(view: 'banners' | 'groups' | 'cards' = 'banners') {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <AssetsWorkspace
        view={view}
        initialAssets={assets}
        taxonomy={{ brands: [], categories: [] }}
        initialProducts={[
          {
            id: 10,
            title: 'Cordless drill',
            slug: 'cordless-drill',
            sku: 'DRILL-10',
            imageUrl: 'https://cdn.example.com/drill.jpg',
            active: true,
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

describe('AssetsWorkspace', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/assets/product-options', () =>
        HttpResponse.json({ items: [], page: 1, limit: 12, total: 0, hasMore: false }),
      ),
      http.get('/api/assets', () => HttpResponse.json(assets)),
      http.post('/api/assets/featured-groups/resolve', () =>
        HttpResponse.json({ total: 1, items: [] }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
  });

  it('renders one flat resource list with URL-backed local navigation', () => {
    const { container } = renderWorkspace();
    expect(container.querySelector('[data-assets-workspace="banners"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assets' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-navigation]')).toHaveLength(1);
    expect(screen.getByText('Banners · 2')).toBeInTheDocument();
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Featured groups' })).toHaveAttribute(
      'href',
      '/en/assets/featured-groups',
    );
    expect(screen.getByText('Workshop campaign')).toBeVisible();
    expect(screen.getByText('Cordless drill')).toBeVisible();
  });

  it('opens an accessible full-height editor instead of a nested form card', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'Actions · Workshop campaign' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const panel = await screen.findByRole('dialog', { name: 'Edit · Banners' });
    expect(within(panel).getByRole('textbox', { name: 'Title' })).toHaveValue('Workshop campaign');
    expect(within(panel).getByRole('textbox', { name: 'Landscape image' })).toBeVisible();
  });

  it('keeps a new editor open when an earlier save finishes', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    let requested = false;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put('/api/assets/banner/1', async () => {
        requested = true;
        await response;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'Actions · Workshop campaign' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const oldPanel = await screen.findByRole('dialog', { name: 'Edit · Banners' });
    await user.click(within(oldPanel).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requested).toBe(true));
    await user.click(within(oldPanel).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    const newPanel = await screen.findByRole('dialog', { name: 'Create · Banners' });
    await user.type(within(newPanel).getByRole('textbox', { name: 'Title' }), 'Keep my draft');
    release();
    await waitFor(() =>
      expect(within(newPanel).getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Keep my draft',
    );
  });

  it('closes overflow actions when focus moves to an outside interaction', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'Actions · Workshop campaign' }));
    expect(screen.getByRole('menu')).toBeVisible();
    await user.click(screen.getByRole('heading', { name: 'Assets' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('rolls an optimistic active toggle back after a visible mutation failure', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/assets/banner/1', () =>
        HttpResponse.json({ error: 'Storefront update failed.' }, { status: 500 }),
      ),
    );
    renderWorkspace();
    const toggle = screen.getByRole('switch', { name: 'Active · Workshop campaign' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('creates through the same protected mutation boundary and refreshes the list', async () => {
    const user = userEvent.setup();
    let requestBody: unknown = null;
    server.use(
      http.post('/api/assets', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    const panel = await screen.findByRole('dialog', { name: 'Create · Banners' });
    await user.type(within(panel).getByRole('textbox', { name: 'Title' }), 'New campaign');
    await user.type(within(panel).getByRole('textbox', { name: 'Arabic title' }), 'حملة جديدة');
    await user.type(
      within(panel).getByRole('textbox', { name: 'Landscape image' }),
      'https://cdn.example.com/new.jpg',
    );
    await user.type(
      within(panel).getByRole('textbox', { name: 'Portrait image' }),
      'https://cdn.example.com/new-mobile.jpg',
    );
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(requestBody).toMatchObject({
        kind: 'banner',
        data: { title: 'New campaign', titleAr: 'حملة جديدة', active: true },
      }),
    );
  });

  it('reorders and deletes from the compact overflow menu', async () => {
    const user = userEvent.setup();
    const reorderBodies: unknown[] = [];
    let deleted = '';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/assets/reorder', async ({ request }) => {
        reorderBodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/assets/:kind/:id', ({ request }) => {
        deleted = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'Actions · Workshop campaign' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(reorderBodies).toHaveLength(1));
    expect(reorderBodies[0]).toMatchObject({ kind: 'banner' });

    await user.click(screen.getByRole('button', { name: 'Actions · Second campaign' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toContain('/api/assets/banner/2'));
  });

  it('edits featured-group rules without adding explanatory clutter', async () => {
    const user = userEvent.setup();
    let updateBody: unknown = null;
    server.use(
      http.put('/api/assets/featured-group/3', async ({ request }) => {
        updateBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWorkspace('groups');
    await user.click(screen.getByRole('button', { name: 'Actions · Workshop tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const panel = await screen.findByRole('dialog', { name: 'Edit · Featured groups' });
    expect(within(panel).queryByText(/OR-union|active products resolve/i)).not.toBeInTheDocument();
    const name = within(panel).getByRole('textbox', { name: 'Group name' });
    await user.clear(name);
    await user.type(name, 'Power tools');
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateBody).toMatchObject({ data: { name: 'Power tools', productIds: [10] } }),
    );
  });

  it('keeps the complete product-card editing workflow in the side panel', async () => {
    const user = userEvent.setup();
    let updateBody: unknown = null;
    server.use(
      http.put('/api/assets/product-card/4', async ({ request }) => {
        updateBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWorkspace('cards');
    await user.click(screen.getByRole('button', { name: 'Actions · Perceuse fiable' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const panel = await screen.findByRole('dialog', { name: 'Edit · Product cards' });
    const title = within(panel).getByRole('textbox', { name: 'French title' });
    await user.clear(title);
    await user.type(title, 'Perceuse atelier');
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateBody).toMatchObject({ data: { titleFr: 'Perceuse atelier', productId: 10 } }),
    );
  });
});
