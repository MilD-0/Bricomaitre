import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { delay, http, HttpResponse } from 'msw';
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

import messages from '../messages/en.json';
import { toast } from '../lib/toast';
import { server } from '../test/mocks/server';
import { BrandsCategoriesManager, BrandsManager, CategoriesManager } from './brands-categories-manager';
import { Toaster } from './ui/toaster';

describe('BrandsCategoriesManager', () => {
  const patchCalls: Array<{ url: string; body: unknown }> = [];
  const postCalls: Array<{ url: string; body: unknown }> = [];
  const deleteCalls: string[] = [];

  beforeEach(() => {
    patchCalls.length = 0;
    postCalls.length = 0;
    deleteCalls.length = 0;
    window.localStorage.clear();

    server.use(
      http.get('/api/brands', ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page');
        const search = url.searchParams.get('search') ?? '';

        return HttpResponse.json({
          writable: true,
          items: [
            {
              id: '1',
              name: page === '2' ? 'Second page brand' : search ? 'Acme Search' : 'Acme',
              slug: page === '2' ? 'second-page-brand' : search ? 'acme-search' : 'acme',
              image: 'https://cdn.example.com/brand.jpg',
              isActive: true,
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-05T00:00:00.000Z',
              createdBy: 'creator@example.com',
              createdByName: 'Creator',
              updatedBy: 'editor@example.com',
              updatedByName: 'Editor',
            },
          ],
          pagination: { page: Number(page ?? '1'), limit: 50, totalItems: 100, totalPages: 2, hasNextPage: page !== '2', hasPreviousPage: page === '2' },
        });
      }),
      http.get('/api/categories', ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page');
        const search = url.searchParams.get('search') ?? '';
        const includeParentOptions = url.searchParams.get('includeParentOptions') === '1';

        return HttpResponse.json({
          writable: true,
          items: [
            {
              id: '10',
              name: page === '2' ? 'Primers' : search ? 'Search paint' : 'Paint',
              slug: page === '2' ? 'primers' : search ? 'search-paint' : 'paint',
              nameAr: 'طلاء',
              image: 'https://cdn.example.com/category.jpg',
              isActive: true,
              status: 'active',
              parentId: '2',
              parentName: 'Walls',
              createdAt: '2026-01-02T00:00:00.000Z',
              updatedAt: '2026-01-06T00:00:00.000Z',
              createdBy: 'creator@example.com',
              createdByName: 'Creator',
              updatedBy: 'editor@example.com',
              updatedByName: 'Editor',
            },
          ],
          parentOptions: includeParentOptions
            ? [
              { id: '2', name: 'Walls' },
              { id: '3', name: 'Wood' },
              { id: '10', name: 'Paint' },
            ]
            : [],
          pagination: { page: Number(page ?? '1'), limit: 50, totalItems: 100, totalPages: 2, hasNextPage: page !== '2', hasPreviousPage: page === '2' },
        });
      }),
      http.post('/api/brands', async ({ request }) => {
        await delay(50);
        postCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/categories', async ({ request }) => {
        await delay(50);
        postCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/brands/:id', async ({ request }) => {
        await delay(50);
        patchCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/categories/:id', async ({ request }) => {
        await delay(50);
        patchCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/brands/:id', ({ request }) => {
        deleteCalls.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/categories/:id', ({ request }) => {
        deleteCalls.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
    window.localStorage.clear();
  });

  function renderManager(ui: React.ReactNode = <BrandsCategoriesManager />) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {ui}
          <Toaster />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('toggles brand active state using status payloads on the brands page', async () => {
    renderManager(<BrandsManager />);

    await screen.findByText('Acme');

    const switchControl = screen.getByRole('switch', { name: 'Status' });
    await userEvent.click(switchControl);
    expect(switchControl).toHaveAttribute('data-state', 'unchecked');
    await screen.findByText('Deactivated brand Acme.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/brands/1',
        body: { status: 'draft' },
      });
    });
  });

  it('toggles category active state using status payloads on the categories page', async () => {
    renderManager(<CategoriesManager />);

    await screen.findByText('Paint');

    const switchControl = screen.getByRole('switch', { name: 'Status' });
    await userEvent.click(switchControl);
    expect(switchControl).toHaveAttribute('data-state', 'unchecked');
    await screen.findByText('Deactivated category Paint.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/categories/10',
        body: { status: 'draft' },
      });
    });
  });

  it('supports popup create flow for brands on the brands page', async () => {
    renderManager(<BrandsManager />);

    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'New brand' }));
    const brandDialog = screen.getByRole('dialog');
    await userEvent.type(within(brandDialog).getByRole('textbox', { name: 'Name' }), 'Nova');
    await userEvent.type(within(brandDialog).getByRole('textbox', { name: 'Image' }), 'https://cdn.example.com/nova.jpg');
    await userEvent.click(within(brandDialog).getByRole('button', { name: 'New brand' }));
    await screen.findByText('Created brand Nova.');

    await waitFor(() => {
      expect(postCalls).toContainEqual({
        url: 'http://localhost:3000/api/brands',
        body: { name: 'Nova', imageUrl: 'https://cdn.example.com/nova.jpg' },
      });
    });
  });

  it('supports creating brands without an uploaded image', async () => {
    renderManager(<BrandsManager />);

    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'New brand' }));
    const brandDialog = screen.getByRole('dialog');
    await userEvent.type(within(brandDialog).getByRole('textbox', { name: 'Name' }), 'No Image Brand');
    await userEvent.click(within(brandDialog).getByRole('button', { name: 'New brand' }));
    await screen.findByText('Created brand No Image Brand.');

    await waitFor(() => {
      expect(postCalls).toContainEqual({
        url: 'http://localhost:3000/api/brands',
        body: { name: 'No Image Brand', imageUrl: null },
      });
    });
  });

  it('supports popup create flow for categories on the categories page', async () => {
    renderManager(<CategoriesManager />);

    await screen.findByText('Paint');

    await userEvent.click(screen.getByRole('button', { name: 'New category' }));
    const categoryDialog = screen.getByRole('dialog');
    await userEvent.type(within(categoryDialog).getByRole('textbox', { name: 'Name' }), 'Sealants');
    await userEvent.type(within(categoryDialog).getByRole('textbox', { name: 'Arabic name' }), 'مواد مانعة للتسرب');
    await userEvent.click(within(categoryDialog).getByRole('button', { name: 'New category' }));
    await waitFor(() => expect(postCalls.length).toBeGreaterThan(0));
    await screen.findByText('Created category Sealants.');

    await waitFor(() => {
      expect(postCalls).toContainEqual({
        url: 'http://localhost:3000/api/categories',
        body: { name: 'Sealants', nameAr: 'مواد مانعة للتسرب', imageUrl: null, parentId: null },
      });
    });
  });

  it('supports popup edit flow for categories on the categories page', async () => {
    renderManager(<CategoriesManager />);

    await screen.findByText('Paint');

    const categoriesSection = screen.getByText('Paint').closest('section') as HTMLElement;
    await userEvent.click(within(categoriesSection).getByRole('button', { name: 'Edit' }));
    const categoryDialog = screen.getByRole('dialog');
    await userEvent.clear(within(categoryDialog).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(categoryDialog).getByRole('textbox', { name: 'Name' }), 'Exterior paint');
    await userEvent.clear(within(categoryDialog).getByRole('textbox', { name: 'Arabic name' }));
    await userEvent.type(within(categoryDialog).getByRole('textbox', { name: 'Arabic name' }), 'طلاء خارجي');
    await userEvent.selectOptions(within(categoryDialog).getByRole('combobox', { name: 'Parent category' }), '3');
    const imageField = within(categoryDialog).getByRole('textbox', { name: 'Image' });
    await userEvent.clear(imageField);
    await userEvent.type(imageField, 'https://cdn.example.com/exterior.jpg');
    await userEvent.click(within(categoryDialog).getByRole('button', { name: 'Save category' }));
    await screen.findByText('Saved category Exterior paint.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/categories/10',
        body: {
          name: 'Exterior paint',
          nameAr: 'طلاء خارجي',
          imageUrl: 'https://cdn.example.com/exterior.jpg',
          parentId: 3,
        },
      });
    });
  });

  it('persists brand dialog draft state across refresh on the brands page', async () => {
    const firstRender = renderManager(<BrandsManager />);

    await screen.findByText('Acme');
    await userEvent.click(screen.getByRole('button', { name: 'New brand' }));

    const firstDialog = screen.getByRole('dialog');
    await userEvent.type(within(firstDialog).getByRole('textbox', { name: 'Name' }), 'Draft brand');
    await userEvent.type(within(firstDialog).getByRole('textbox', { name: 'Image' }), 'https://cdn.example.com/draft.jpg');

    firstRender.unmount();

    renderManager(<BrandsManager />);

    const restoredDialog = await screen.findByRole('dialog');
    expect(within(restoredDialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Draft brand');
    expect(within(restoredDialog).getByRole('textbox', { name: 'Image' })).toHaveValue('https://cdn.example.com/draft.jpg');
  });

  it('supports bulk actions and pagination on the brands page', async () => {
    renderManager(<BrandsManager />);

    await screen.findByText('Acme');

    const brandsSection = screen.getByText('Acme').closest('section') as HTMLElement;
    await userEvent.click(within(brandsSection).getByRole('checkbox', { name: 'Select Acme' }));
    await userEvent.click(within(brandsSection).getByRole('button', { name: 'Activate selected' }));
    await screen.findByText('Activated 1 selected brands.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/brands/1',
        body: { status: 'active' },
      });
    });

    await userEvent.click(within(brandsSection).getByRole('checkbox', { name: 'Select Acme' }));
    await userEvent.click(within(brandsSection).getByRole('button', { name: 'Delete selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Deleted 1 selected.');

    await waitFor(() => {
      expect(deleteCalls).toContain('http://localhost:3000/api/brands/1');
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'Go to page 2' })[0]);

    await screen.findByText('Second page brand');
    expect(screen.queryByAltText('Second page brand')).not.toBeInTheDocument();
  });

  it('supports pagination on the categories page', async () => {
    renderManager(<CategoriesManager />);

    await screen.findByText('Paint');

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    await screen.findByText('Primers');
    expect(screen.queryByAltText('Primers')).not.toBeInTheDocument();
  });

  it('restores optimistic updates and shows a failure toast when a mutation fails', async () => {
    server.use(
      http.patch('/api/brands/:id', async () => {
        await delay(50);
        return new HttpResponse('broken', { status: 500 });
      }),
    );

    renderManager();

    await screen.findByText('Acme');

    const brandSection = screen.getByText('Acme').closest('section') as HTMLElement;
    const brandSwitch = within(brandSection).getByRole('switch', { name: 'Status' });

    expect(brandSwitch).toHaveAttribute('data-state', 'checked');
    await userEvent.click(brandSwitch);
    expect(brandSwitch).toHaveAttribute('data-state', 'unchecked');

    await waitFor(() => {
      expect(brandSwitch).toHaveAttribute('data-state', 'checked');
    });
    await screen.findByText('Failed to deactivate brand Acme. broken');
  });
});
