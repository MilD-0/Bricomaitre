import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '../../lib/toast';
import { server } from '../../test/mocks/server';
import { LandingPageIndex, type LandingPageSummary } from './landing-page-index';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: navigation.push }),
}));

const items: LandingPageSummary[] = [
  {
    id: 7,
    productId: 10,
    productTitle: 'Cordless drill',
    productSlug: 'cordless-drill',
    locale: 'fr',
    slug: 'cordless-drill-7',
    active: true,
    currentRevision: 3,
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 8,
    productId: 11,
    productTitle: 'Workshop lamp',
    productSlug: 'workshop-lamp',
    locale: 'ar',
    slug: 'workshop-lamp-8',
    active: false,
    currentRevision: 1,
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

function renderIndex() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <LandingPageIndex initialItems={items} storefrontBaseUrl="https://bricomaitre.com" />
    </NextIntlClientProvider>,
  );
}

describe('LandingPageIndex', () => {
  beforeEach(() => {
    navigation.push.mockReset();
    server.use(
      http.get('/api/assets/product-options', () =>
        HttpResponse.json({
          items: [
            {
              id: 12,
              title: 'Impact driver',
              slug: 'impact-driver',
              sku: 'IMPACT-12',
              imageUrl: null,
              active: true,
            },
          ],
          page: 1,
          limit: 12,
          total: 1,
          hasMore: false,
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
  });

  it('filters concise records and exposes live links only for active pages', async () => {
    const user = userEvent.setup();
    renderIndex();
    expect(screen.getByRole('heading', { name: 'Assets' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(screen.getByText('Landing pages · 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cordless drill' })).toHaveClass('block', 'truncate');
    expect(document.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-workspace-navigation]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /View live page/ })).toHaveAttribute(
      'href',
      'https://bricomaitre.com/fr/landing/cordless-drill-7',
    );
    expect(screen.getAllByRole('link', { name: /View live page/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Preview saved page/ })).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'Preview saved page · Workshop lamp' }),
    ).toHaveAttribute('href', '/api/landing-pages/8?view=preview');
    await user.type(screen.getByRole('searchbox', { name: 'Search landing pages' }), 'lamp');
    expect(screen.queryByText('Cordless drill')).not.toBeInTheDocument();
    expect(screen.getByText('Workshop lamp')).toBeVisible();
  });

  it('creates from server-backed product search and navigates to the focused builder', async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      http.post('/api/landing-pages', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 12 }, { status: 201 });
      }),
    );
    renderIndex();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create landing page' });
    await user.click(await within(dialog).findByRole('button', { name: /Impact driver/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(body).toEqual({ productId: 12, locale: 'fr' }));
    expect(navigation.push).toHaveBeenCalledWith('/en/assets/landing-pages/12');
  });

  it('rolls an active toggle back when the revision-aware mutation fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/landing-pages/7', () =>
        HttpResponse.json({ error: 'Stale revision.' }, { status: 409 }),
      ),
    );
    renderIndex();
    const toggle = screen.getByRole('switch', { name: 'Active · Cordless drill' });
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
  });
});
