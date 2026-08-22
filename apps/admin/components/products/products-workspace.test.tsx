import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import type { PaginationMeta } from '../../lib/pagination';
import type { ProductRecord } from '../../lib/products';
import { server } from '../../test/mocks/server';
import { ProductsWorkspace } from './products-workspace';

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'First product',
    titleAr: 'المنتج الأول',
    description: 'A useful first product.',
    descriptionAr: null,
    slug: 'first-product',
    sku: 'FIRST-1',
    barcode: null,
    price: 1200,
    oldPrice: null,
    purchasePrice: 700,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 8,
    brandId: 10,
    categoryId: 20,
    images: [],
    promoCodes: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-18T10:00:00.000Z',
    orderPurchaseCount: 12,
    confirmedOrderCount: 8,
    confirmationRate: 66.7,
  },
  {
    id: 2,
    title: 'Second product',
    titleAr: null,
    description: null,
    descriptionAr: null,
    slug: 'second-product',
    sku: 'SECOND-2',
    barcode: '222',
    price: 2400,
    oldPrice: null,
    purchasePrice: 1400,
    active: false,
    inStock: false,
    availabilityStatus: 'out_of_stock',
    inventoryQuantity: 0,
    brandId: null,
    categoryId: null,
    images: [],
    promoCodes: [],
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-17T10:00:00.000Z',
    orderPurchaseCount: 3,
    confirmedOrderCount: 1,
    confirmationRate: 33.3,
  },
];

vi.mock('../image-upload-field', () => ({
  ImageUploadField: ({ label }: { label: string }) => <div>{label}</div>,
}));

function renderWorkspace(paginationOverrides: Partial<PaginationMeta> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProductsWorkspace
          initialData={{
            items: products,
            pagination: {
              page: 1,
              limit: 50,
              totalItems: products.length,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
              ...paginationOverrides,
            },
          }}
          initialMeta={{
            brands: [{ id: 10, name: 'Acme' }],
            categories: [{ id: 20, name: 'Tools' }],
          }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ProductsWorkspace', () => {
  afterEach(() => cleanup());

  it('renders as the flat integrated products workspace', () => {
    const { container } = renderWorkspace();
    const workspace = container.querySelector('[data-admin-workspace="products"]');

    expect(workspace).toBeInTheDocument();
    expect(workspace?.className).not.toMatch(/rounded|shadow|glass-surface/);
    expect(workspace?.querySelectorAll('[data-workspace-frame]')).toHaveLength(0);
    expect(workspace?.matches('[data-workspace-frame]')).toBe(true);
    expect(workspace?.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Products' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(screen.getByText('2 products')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New product' })).toBeInTheDocument();
    expect(workspace?.querySelector('[data-workspace-toolbar]')).toBeInTheDocument();
  });

  it('keeps secondary product filters behind a deliberate phone control', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const filterButton = screen.getByRole('button', { name: 'Filters' });

    expect(filterButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(filterButton);
    expect(filterButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the complete product editor and saves through the protected product endpoint', async () => {
    const user = userEvent.setup();
    let savedBody: unknown = null;
    server.use(
      http.get('/api/products/1', () => HttpResponse.json({ item: products[0] })),
      http.put('/api/products/1', async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/products', () =>
        HttpResponse.json({
          items: products,
          pagination: {
            page: 1,
            limit: 50,
            totalItems: products.length,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      ),
    );
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Actions · First product' })[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit product' })).toBeInTheDocument();
    expect(screen.queryByText('Set the product details, pricing, stock, and images.')).toBeNull();
    expect(screen.queryByText('Customer-facing names and operational references.')).toBeNull();
    expect(
      screen.queryByText('Pricing, organization, inventory, and publishing state.'),
    ).toBeNull();
    expect(screen.queryByText('French and Arabic content share one editing flow.')).toBeNull();
    expect(
      screen.queryByText('Create hidden product discount links with fixed promotional prices.'),
    ).toBeNull();
    expect(screen.queryByRole('heading', { name: 'AI product content' })).toBeNull();
    const title = await screen.findByLabelText('Product name');
    await user.clear(title);
    await user.type(title, 'First product revised');
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    await waitFor(() =>
      expect(savedBody).toMatchObject({
        title: 'First product revised',
        sku: 'FIRST-1',
        price: 1200,
        active: true,
        inStock: true,
      }),
    );
  });

  it('links product titles to the storefront and applies full-catalog filters and multi-sort', async () => {
    const user = userEvent.setup();
    const requestedUrls: URL[] = [];
    server.use(
      http.get('/api/products', ({ request }) => {
        requestedUrls.push(new URL(request.url));
        return HttpResponse.json({
          items: products,
          pagination: {
            page: 1,
            limit: 50,
            totalItems: products.length,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        });
      }),
    );
    renderWorkspace();

    for (const link of screen.getAllByRole('link', { name: 'First product' })) {
      expect(link).toHaveAttribute('href', 'https://bricomaitre.com/products/first-product');
      expect(link).toHaveAttribute('target', '_blank');
    }

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by brand' }), '10');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filters' }), 'out');
    await user.click(screen.getByRole('button', { name: 'Product' }));

    await waitFor(() => {
      const lastRequest = requestedUrls.at(-1);
      expect(lastRequest?.searchParams.get('brandId')).toBe('10');
      expect(lastRequest?.searchParams.get('state')).toBe('out');
      expect(lastRequest?.searchParams.getAll('sort')).toEqual(['title:asc']);
      expect(lastRequest?.searchParams.has('imageOrigin')).toBe(false);
    });
  });

  it('keeps secondary bulk operations available in one compact actions menu', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('checkbox', { name: 'Select First product' })[0]!);
    await user.click(screen.getByLabelText('Actions'));

    expect(screen.getByRole('menuitem', { name: 'Activate selected' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Deactivate selected' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mark in stock' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mark out of stock' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy product IDs' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export Meta catalog' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Archive selected' })).toBeInTheDocument();

    await user.click(screen.getByRole('searchbox'));
    expect(screen.queryByRole('menuitem', { name: 'Activate selected' })).toBeNull();
    expect(screen.getByLabelText('Actions')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps table columns aligned, omits creation dates, and groups row actions', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    const table = container.querySelector('table');

    expect(table).not.toBeNull();
    const headers = within(table!).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent?.trim())).toEqual([
      '',
      'Product',
      'Price',
      'Purchase price',
      'Purchases',
      'Confirmation rate',
      'Active',
      'In stock',
      'Modified',
      '',
    ]);

    const firstProductRow = within(table!).getAllByRole('row')[1]!;
    const cells = within(firstProductRow).getAllByRole('cell');
    expect(
      within(cells[7]!).getByRole('switch', { name: 'In stock · First product' }),
    ).toBeChecked();
    expect(cells[8]).toHaveTextContent('Aug 18, 2026');

    await user.click(within(cells[9]!).getByRole('button', { name: 'Actions · First product' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
    await user.click(screen.getByRole('searchbox'));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
  });

  it('keeps individual archival in the row menu behind confirmation', async () => {
    const user = userEvent.setup();
    let deletedProductId: string | null = null;
    server.use(
      http.delete('/api/products/:id', ({ params }) => {
        deletedProductId = String(params.id);
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/products', () =>
        HttpResponse.json({
          items: products.slice(1),
          pagination: {
            page: 1,
            limit: 50,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      ),
    );
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Actions · First product' })[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(
      screen.getByText('This product will be hidden from the storefront.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(deletedProductId).toBe('1'));
  });

  it('offers compact direct navigation across a long product catalog', async () => {
    const user = userEvent.setup();
    const requestedPages: string[] = [];
    server.use(
      http.get('/api/products', ({ request }) => {
        const requestedPage = new URL(request.url).searchParams.get('page') ?? '1';
        requestedPages.push(requestedPage);
        return HttpResponse.json({
          items: products,
          pagination: {
            page: Number(requestedPage),
            limit: 50,
            totalItems: 1_000,
            totalPages: 20,
            hasNextPage: requestedPage !== '20',
            hasPreviousPage: requestedPage !== '1',
          },
        });
      }),
    );
    renderWorkspace({ totalItems: 1_000, totalPages: 20, hasNextPage: true });

    expect(screen.getByRole('navigation', { name: 'Go to page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Go to page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 6' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Go to page 20' }));
    await waitFor(() => expect(requestedPages.at(-1)).toBe('20'));
  });
});
