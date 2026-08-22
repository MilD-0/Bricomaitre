import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import messages from '../../messages/en.json';
import { toast } from '../../lib/toast';
import { server } from '../../test/mocks/server';
import { Toaster } from '../ui/toaster';

import { TaxonomyWorkspace } from './taxonomy-workspace';

const pagination = {
  page: 1,
  limit: 50,
  totalItems: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const audit = {
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

describe('taxonomy workspace preview', () => {
  const patches: Array<{ url: string; body: unknown }> = [];
  const posts: Array<{ url: string; body: unknown }> = [];
  const deletes: string[] = [];

  beforeEach(() => {
    patches.length = 0;
    posts.length = 0;
    deletes.length = 0;

    server.use(
      http.get('/api/brands', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json({
          writable: true,
          items: [
            {
              id: '1',
              name: page === 2 ? 'Beta' : 'Acme',
              slug: page === 2 ? 'beta' : 'acme',
              image: null,
              isActive: true,
              status: 'active',
              productCount: page === 2 ? 4 : 18,
              ...audit,
            },
          ],
          pagination: {
            ...pagination,
            page,
            totalItems: 51,
            totalPages: 2,
            hasNextPage: page === 1,
            hasPreviousPage: page === 2,
          },
        });
      }),
      http.get('/api/categories', ({ request }) => {
        const includeParents =
          new URL(request.url).searchParams.get('includeParentOptions') === '1';
        return HttpResponse.json({
          writable: true,
          items: [
            {
              id: '10',
              name: 'Power tools',
              nameAr: 'أدوات كهربائية',
              slug: 'power-tools',
              image: null,
              isActive: true,
              status: 'active',
              parentId: '3',
              parentName: 'Tools',
              productCount: 42,
              ...audit,
            },
          ],
          parentOptions: includeParents
            ? [
                { id: '3', name: 'Tools' },
                { id: '10', name: 'Power tools' },
              ]
            : [],
          pagination,
        });
      }),
      http.patch('/api/brands/:id', async ({ request }) => {
        patches.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/categories/:id', async ({ request }) => {
        patches.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/categories', async ({ request }) => {
        posts.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/brands/:id', ({ request }) => {
        deletes.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
  });

  function renderWorkspace(view: 'brands' | 'categories') {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <TaxonomyWorkspace view={view} />
          <Toaster />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('presents a flat brand list with useful counts, navigation, sorting, and pagination', async () => {
    const view = renderWorkspace('brands');

    await screen.findByText('Acme');
    expect(view.container.querySelector('[data-mobile-taxonomy-controls]')).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(screen.getByRole('heading', { name: 'Brands' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-navigation]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(screen.getByText('18 products')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brands' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute(
      'href',
      '/en/categories',
    );

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'products');
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await screen.findByText('Beta');
  });

  it('edits a category in a responsive inspector with parent and Arabic fields', async () => {
    renderWorkspace('categories');

    await screen.findByText('Power tools');
    await userEvent.click(screen.getByText('Power tools').closest('button') as HTMLElement);

    const inspector = screen.getByRole('dialog', { name: 'Edit · Category' });
    await userEvent.clear(within(inspector).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(
      within(inspector).getByRole('textbox', { name: 'Name' }),
      'Cordless tools',
    );
    await userEvent.clear(within(inspector).getByRole('textbox', { name: 'Arabic name' }));
    await userEvent.type(
      within(inspector).getByRole('textbox', { name: 'Arabic name' }),
      'أدوات لاسلكية',
    );
    await userEvent.selectOptions(
      within(inspector).getByRole('combobox', { name: 'Parent category' }),
      '3',
    );
    await userEvent.click(within(inspector).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patches).toContainEqual({
        url: 'http://localhost:3000/api/categories/10',
        body: {
          name: 'Cordless tools',
          nameAr: 'أدوات لاسلكية',
          imageUrl: null,
          parentId: 3,
        },
      }),
    );
  });

  it('creates categories through the same inspector contract', async () => {
    renderWorkspace('categories');
    await screen.findByText('Power tools');

    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
    const inspector = screen.getByRole('dialog', { name: 'Create · Category' });
    await userEvent.type(within(inspector).getByRole('textbox', { name: 'Name' }), 'Safety');
    await userEvent.type(
      within(inspector).getByRole('textbox', { name: 'Arabic name' }),
      'السلامة',
    );
    await userEvent.click(within(inspector).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(posts).toContainEqual({
        url: 'http://localhost:3000/api/categories',
        body: { name: 'Safety', nameAr: 'السلامة', imageUrl: null, parentId: null },
      }),
    );
  });

  it('keeps status and destructive actions available without cluttering each row', async () => {
    renderWorkspace('brands');
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('switch', { name: 'Acme · Active' }));
    await waitFor(() =>
      expect(patches).toContainEqual({
        url: 'http://localhost:3000/api/brands/1',
        body: { status: 'draft' },
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions · Acme' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(deletes).toContain('http://localhost:3000/api/brands/1'));
  });

  it('reveals compact bulk controls only after selection', async () => {
    renderWorkspace('brands');
    await screen.findByText('Acme');

    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Acme' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(patches).toContainEqual({
        url: 'http://localhost:3000/api/brands/1',
        body: { status: 'draft' },
      }),
    );
  });

  it('rolls an optimistic status change back and surfaces the failure', async () => {
    server.use(
      http.patch('/api/brands/:id', async () => {
        await delay(50);
        return HttpResponse.json({ error: 'Unavailable' }, { status: 503 });
      }),
    );
    renderWorkspace('brands');
    await screen.findByText('Acme');

    const status = screen.getByRole('switch', { name: 'Acme · Active' });
    await userEvent.click(status);
    expect(status).toHaveAttribute('data-state', 'unchecked');

    await waitFor(() => expect(status).toHaveAttribute('data-state', 'checked'));
    await screen.findByText('Unavailable');
  });
});
