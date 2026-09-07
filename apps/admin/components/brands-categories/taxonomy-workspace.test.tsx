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

  it('requests the selected server sort from page one and retains it when paging', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/brands', ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        const page = Number(query.get('page'));
        const name =
          query.get('sort') === 'products'
            ? page === 1
              ? 'Most products'
              : 'Fewer products'
            : 'Recently updated';
        return HttpResponse.json({
          writable: true,
          items: [
            {
              id: String(page),
              name,
              slug: name.toLowerCase().replaceAll(' ', '-'),
              isActive: true,
              status: 'active',
              productCount: 10,
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
    );
    renderWorkspace('brands');
    await screen.findByText('Recently updated');
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(queries.at(-1)?.get('page')).toBe('2'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'products');
    await screen.findByText('Most products', { selector: 'span' });
    expect(queries.at(-1)?.get('page')).toBe('1');
    expect(queries.at(-1)?.get('sort')).toBe('products');
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await screen.findByText('Fewer products');
    expect(queries.at(-1)?.get('sort')).toBe('products');
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

  it('reloads successful bulk changes and leaves failed brands selected', async () => {
    const items = ['Acme', 'Beta'].map((name, index) => ({
      id: String(index + 1),
      name,
      slug: name.toLowerCase(),
      image: null,
      isActive: true,
      status: 'active',
      productCount: 0,
      ...audit,
    }));
    server.use(
      http.get('/api/brands', () =>
        HttpResponse.json({ writable: true, items, pagination: { ...pagination, totalItems: 2 } }),
      ),
      http.patch('/api/brands/1', async () => {
        await delay(30);
        items[0]!.isActive = false;
        items[0]!.status = 'draft';
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/brands/2', () =>
        HttpResponse.json({ error: 'Unavailable' }, { status: 503 }),
      ),
    );
    renderWorkspace('brands');
    await screen.findByText('Acme');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Acme' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Select Acme' })).not.toBeChecked(),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Acme · Inactive' })).toHaveAttribute(
        'data-state',
        'unchecked',
      ),
    );
    expect(screen.getByRole('checkbox', { name: 'Select Beta' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Beta · Active' })).toHaveAttribute(
      'data-state',
      'checked',
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
  it.each([true, false])(
    'keeps the current sort when an older mutation finishes with success=%s',
    async (succeeds) => {
      let release!: () => void;
      const patchWait = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = false;
      server.use(
        http.get('/api/brands', ({ request }) => {
          const sort = new URL(request.url).searchParams.get('sort');
          const name = sort === 'products' ? 'Most products record' : 'Old updated record';
          return HttpResponse.json({
            writable: true,
            items: [
              {
                id: '1',
                name,
                slug: 'brand',
                isActive: true,
                status: 'active',
                productCount: 10,
                ...audit,
              },
            ],
            pagination,
          });
        }),
        http.patch('/api/brands/1', async () => {
          started = true;
          await patchWait;
          return succeeds
            ? HttpResponse.json({ ok: true })
            : HttpResponse.json({ error: 'Mutation failed' }, { status: 503 });
        }),
      );
      renderWorkspace('brands');
      await screen.findByText('Old updated record');
      await userEvent.click(screen.getByRole('switch', { name: 'Old updated record · Active' }));
      await waitFor(() => expect(started).toBe(true));
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'products');
      await screen.findByText('Most products record');
      release();
      await screen.findByText(succeeds ? 'Saved.' : 'Mutation failed');
      expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('products');
      expect(screen.getByText('Most products record')).toBeVisible();
      expect(screen.queryByText('Old updated record')).not.toBeInTheDocument();
    },
  );
});
