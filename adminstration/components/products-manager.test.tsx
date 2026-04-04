import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { xlsxMock } = vi.hoisted(() => ({
  xlsxMock: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ Sheets: {}, SheetNames: [] })),
    book_append_sheet: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: xlsxMock.aoa_to_sheet,
    book_new: xlsxMock.book_new,
    book_append_sheet: xlsxMock.book_append_sheet,
  },
  writeFile: xlsxMock.writeFile,
}));

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
import { ProductsManager } from './products-manager';
import { Toaster } from './ui/toaster';

type Product = {
  id: number;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  oldPrice: number | null;
  purchasePrice: number | null;
  active: boolean;
  inStock: boolean;
  availabilityStatus: 'in_stock' | 'out_of_stock';
  inventoryQuantity: number;
  brandId: number | null;
  categoryId: number | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
};

const postCalls: Array<{ url: string; body: unknown }> = [];
const putCalls: Array<{ url: string; body: unknown }> = [];
const patchCalls: Array<{ url: string; body: unknown }> = [];
const deleteCalls: string[] = [];
const exportAllStartCalls: string[] = [];
const exportAllCancelCalls: string[] = [];

describe('ProductsManager', () => {
  let products: Product[];
  let exportAllJob: {
    id: string;
    status: 'running' | 'completed' | 'cancelled' | 'failed';
    fileName: string | null;
    progress: { phase: 'counting' | 'loading' | 'processing-images' | 'packaging'; current: number; total: number; percentage: number };
    errorMessage: string | null;
    downloadPath: string | null;
  } | null;

  function paginatedProductsResponse(requestUrl: string) {
    const url = new URL(requestUrl);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const brandId = url.searchParams.get('brandId');
    const categoryId = url.searchParams.get('categoryId');
    const sortKey = url.searchParams.get('sortKey') ?? 'updatedAt';
    const sortDirection = url.searchParams.get('sortDirection') ?? 'desc';

    const filtered = products.filter((product) => {
      if (brandId && product.brandId !== Number(brandId)) {
        return false;
      }

      if (categoryId && product.categoryId !== Number(categoryId)) {
        return false;
      }

      const target = [product.title, product.sku, product.barcode].filter(Boolean).join(' ').toLowerCase();
      return search.length === 0 || target.includes(search);
    });

    const sorted = [...filtered].sort((left, right) => {
      const leftValue = left[sortKey as keyof Product] ?? '';
      const rightValue = right[sortKey as keyof Product] ?? '';
      const normalizedLeft = typeof leftValue === 'string' ? leftValue.toLowerCase() : leftValue;
      const normalizedRight = typeof rightValue === 'string' ? rightValue.toLowerCase() : rightValue;

      if (normalizedLeft < normalizedRight) {
        return sortDirection === 'asc' ? -1 : 1;
      }

      if (normalizedLeft > normalizedRight) {
        return sortDirection === 'asc' ? 1 : -1;
      }

      return 0;
    });

    const start = (page - 1) * limit;

    return {
      items: sorted.slice(start, start + limit),
      pagination: {
        page,
        limit,
        totalItems: sorted.length,
        totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
        hasNextPage: start + limit < sorted.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  beforeEach(() => {
    products = [
      {
        id: 1,
        title: 'Existing product',
        titleAr: null,
        description: 'Existing description',
        descriptionAr: null,
        sku: 'EX-1',
        barcode: '111',
        price: 19.5,
        oldPrice: 25,
        purchasePrice: 10,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 4,
        brandId: 1,
        categoryId: 10,
        images: ['https://cdn.example.com/p-1.jpg'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Paint bucket',
        titleAr: null,
        description: 'Bucket description',
        descriptionAr: null,
        sku: 'PAI-2',
        barcode: '222',
        price: 9.5,
        oldPrice: null,
        purchasePrice: 4,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 8,
        brandId: 2,
        categoryId: 20,
        images: ['https://cdn.example.com/p-2.jpg'],
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ];
    postCalls.length = 0;
    putCalls.length = 0;
    patchCalls.length = 0;
    deleteCalls.length = 0;
    exportAllStartCalls.length = 0;
    exportAllCancelCalls.length = 0;
    exportAllJob = null;
    xlsxMock.aoa_to_sheet.mockClear();
    xlsxMock.book_new.mockClear();
    xlsxMock.book_append_sheet.mockClear();
    xlsxMock.writeFile.mockClear();
    window.localStorage.clear();

    server.use(
      http.get('/api/products/meta-export', ({ request }) => HttpResponse.text(request.url)),
      http.get('/api/products', ({ request }) => HttpResponse.json(paginatedProductsResponse(request.url))),
      http.get('/api/products/meta', () => HttpResponse.json({
        brands: [{ id: 1, name: 'Acme' }, { id: 2, name: 'Nova' }],
        categories: [{ id: 10, name: 'Tools', parentId: null }, { id: 20, name: 'Paint', parentId: null }],
      })),
      http.post('/api/products', async ({ request }) => {
        await delay(50);
        const body = await request.json();
        postCalls.push({ url: request.url, body });
        const payload = body as Product;
        products = [
          {
            ...payload,
            id: products.length + 1,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
          },
          ...products,
        ];
        return HttpResponse.json({ ok: true });
      }),
      http.put('/api/products/:id', async ({ request, params }) => {
        await delay(50);
        const body = await request.json();
        putCalls.push({ url: request.url, body });
        products = products.map((product) =>
          product.id === Number(params.id)
            ? { ...product, ...(body as Partial<Product>), updatedAt: '2026-01-04T00:00:00.000Z' }
            : product,
        );
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/products/:id', async ({ request, params }) => {
        await delay(50);
        const body = await request.json();
        patchCalls.push({ url: request.url, body });
        products = products.map((product) =>
          product.id === Number(params.id)
            ? { ...product, ...(body as Partial<Product>), updatedAt: '2026-01-05T00:00:00.000Z' }
            : product,
        );
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/products/export-all', () => HttpResponse.json({ job: exportAllJob })),
      http.post('/api/products/export-all', ({ request }) => {
        exportAllStartCalls.push(request.url);
        exportAllJob = {
          id: 'job-1',
          status: 'running',
          fileName: null,
          progress: { phase: 'loading', current: 1, total: 2, percentage: 50 },
          errorMessage: null,
          downloadPath: null,
        };
        return HttpResponse.json({ job: exportAllJob }, { status: 201 });
      }),
      http.delete('/api/products/export-all', ({ request }) => {
        exportAllCancelCalls.push(request.url);
        exportAllJob = exportAllJob ? { ...exportAllJob, status: 'cancelled' } : null;
        return exportAllJob
          ? HttpResponse.json({ job: exportAllJob })
          : HttpResponse.json({ error: 'No export job is currently running.' }, { status: 404 });
      }),
      http.delete('/api/products/:id', ({ request, params }) => {
        deleteCalls.push(request.url);
        products = products.filter((product) => product.id !== Number(params.id));
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
    window.localStorage.clear();
  });

  function renderProductsManager({ initialCanExportAll = false }: { initialCanExportAll?: boolean } = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <ProductsManager initialCanExportAll={initialCanExportAll} />
          <Toaster />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('opens the popup create flow and persists product draft state', async () => {
    const firstRender = renderProductsManager();

    await screen.findAllByRole('button', { name: 'Existing product' });
    await userEvent.click(screen.getByRole('button', { name: 'New product' }));

    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Product name' }), 'Nova drill');
    await userEvent.clear(within(dialog).getByRole('spinbutton', { name: 'Price' }));
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Price' }), '12.75');

    firstRender.unmount();

    renderProductsManager();

    const restoredDialog = await screen.findByRole('dialog');
    expect(within(restoredDialog).getByRole('textbox', { name: 'Product name' })).toHaveValue('Nova drill');
    expect(within(restoredDialog).getByRole('spinbutton', { name: 'Price' })).toHaveValue(12.75);
  });

  it('opens the edit popup, shows image preview on hover, and saves changes', async () => {
    renderProductsManager();

    const titleButton = (await screen.findAllByRole('button', { name: 'Existing product' }))[0];
    expect(screen.getAllByAltText('Existing product thumbnail').length).toBeGreaterThan(0);
    await userEvent.hover(titleButton);
    expect(await screen.findByAltText('Existing product')).toBeInTheDocument();
    await userEvent.click(titleButton);

    const dialog = screen.getByRole('dialog');
    const titleInput = within(dialog).getByRole('textbox', { name: 'Product name' });
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated product');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save product' }));

    await screen.findByText('Saved product Updated product.');
    await waitFor(() => {
      expect(putCalls).toContainEqual({
        url: 'http://localhost:3000/api/products/1',
        body: expect.objectContaining({
          title: 'Updated product',
          active: true,
        }),
      });
    });
  });

  it('supports row toggle mutations and bulk actions with toasts', async () => {
    renderProductsManager();

    const titleButton = (await screen.findAllByRole('button', { name: 'Existing product' }))[0];
    const productRow = titleButton.closest('tr') as HTMLElement;

    const activeSwitch = within(productRow).getByRole('switch', { name: 'Active' });
    await userEvent.click(activeSwitch);
    expect(activeSwitch).toHaveAttribute('data-state', 'unchecked');
    await screen.findByText('Deactivated product Existing product.');

    const stockSwitch = within(productRow).getByRole('switch', { name: 'In stock' });
    await userEvent.click(stockSwitch);
    expect(stockSwitch).toHaveAttribute('data-state', 'unchecked');
    await screen.findByText('Marked product Existing product out of stock.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/products/1',
        body: { active: false },
      });
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/products/1',
        body: { inStock: false },
      });
    });

    await userEvent.click(within(productRow).getByRole('checkbox', { name: 'Select Existing product' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark in stock' }));
    await screen.findByText('Marked 1 selected products in stock.');
    await waitFor(() => {
      expect(patchCalls).toContainEqual({
        url: 'http://localhost:3000/api/products/1',
        body: { inStock: true },
      });
    });
  });

  it('filters products by brand and category', async () => {
    renderProductsManager();

    await screen.findAllByRole('button', { name: 'Existing product' });
    expect(
      screen.getAllByText((_, element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim() === 'DZD 20').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Paint bucket' }).length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by brand' }), '1');
    expect(screen.getAllByRole('button', { name: 'Existing product' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Paint bucket' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by brand' }), '');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), '20');
    expect(screen.getAllByRole('button', { name: 'Paint bucket' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Existing product' })).not.toBeInTheDocument();
  });

  it('supports direct page navigation for larger product tables', async () => {
    products = Array.from({ length: 55 }, (_, index) => ({
      id: index + 1,
      title: `Product ${index + 1}`,
      titleAr: null,
      description: `Description ${index + 1}`,
      descriptionAr: null,
      sku: `SKU-${index + 1}`,
      barcode: `${1000 + index}`,
      price: 10 + index,
      oldPrice: null,
      purchasePrice: 5 + index,
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      inventoryQuantity: index + 1,
      brandId: 1,
      categoryId: 10,
      images: [`https://cdn.example.com/p-${index + 1}.jpg`],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }));

    renderProductsManager();

    expect((await screen.findAllByRole('button', { name: 'Product 1' })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: 'Product 51' })).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect((await screen.findAllByRole('button', { name: 'Product 51' })).length).toBeGreaterThan(0);

    const jumpInput = screen.getByRole('spinbutton', { name: 'Go to page' });
    await userEvent.clear(jumpInput);
    await userEvent.type(jumpInput, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect((await screen.findAllByRole('button', { name: 'Product 1' })).length).toBeGreaterThan(0);
  }, 10000);

  it('deletes selected products from the bulk action flow', async () => {
    renderProductsManager();

    const titleButton = (await screen.findAllByRole('button', { name: 'Existing product' }))[0];
    const productRow = titleButton.closest('tr') as HTMLElement;
    await userEvent.click(within(productRow).getByRole('checkbox', { name: 'Select Existing product' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await screen.findByText('Deleted 1 selected.');
    await waitFor(() => {
      expect(deleteCalls).toContain('http://localhost:3000/api/products/1');
    });
  });

  it('previews and exports selected products for the Meta catalog', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderProductsManager();

    const titleButton = (await screen.findAllByRole('button', { name: 'Existing product' }))[0];
    const productRow = titleButton.closest('tr') as HTMLElement;
    await userEvent.click(within(productRow).getByRole('checkbox', { name: 'Select Existing product' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export Meta catalog' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('id')).toBeInTheDocument();
    expect(within(dialog).getByText('title')).toBeInTheDocument();
    expect(within(dialog).getByText('Existing product')).toBeInTheDocument();
    expect(within(dialog).getByText('Existing description')).toBeInTheDocument();
    expect(within(dialog).getByText('in stock')).toBeInTheDocument();
    expect(within(dialog).getByText('19.5 DZD')).toBeInTheDocument();
    expect(within(dialog).getByText('https://bricomaitre.com/products/1')).toBeInTheDocument();
    expect(within(dialog).getByText('https://cdn.example.com/p-1.jpg')).toBeInTheDocument();
    expect(within(dialog).getByText('Acme')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Export XLSX' }));

    expect(openSpy).toHaveBeenCalledWith('/api/products/meta-export?ids=1', '_self');
  });

  it('shows the all-products export only for privileged users and supports cancellation', async () => {
    renderProductsManager();

    await screen.findAllByRole('button', { name: 'Existing product' });
    expect(screen.queryByRole('button', { name: 'Export all products' })).not.toBeInTheDocument();

    cleanup();
    renderProductsManager({ initialCanExportAll: true });

    await screen.findAllByRole('button', { name: 'Existing product' });
    await userEvent.click(screen.getByRole('button', { name: 'Export all products' }));

    await screen.findByText('Products export started.');
    expect(exportAllStartCalls).toContain('http://localhost:3000/api/products/export-all');
    expect(await screen.findByText('Reading products')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel export' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel export' }));

    await screen.findByText('Products export cancellation requested.');
    expect(exportAllCancelCalls).toContain('http://localhost:3000/api/products/export-all');
  });

  it('restores optimistic toggles and shows a failure toast when a patch fails', async () => {
    server.use(
      http.patch('/api/products/:id', async () => {
        await delay(50);
        return new HttpResponse('broken', { status: 500 });
      }),
    );

    renderProductsManager();

    const titleButton = (await screen.findAllByRole('button', { name: 'Existing product' }))[0];
    const productRow = titleButton.closest('tr') as HTMLElement;

    const activeSwitch = within(productRow).getByRole('switch', { name: 'Active' });
    expect(activeSwitch).toHaveAttribute('data-state', 'checked');

    await userEvent.click(activeSwitch);
    expect(activeSwitch).toHaveAttribute('data-state', 'unchecked');

    await waitFor(() => {
      expect(activeSwitch).toHaveAttribute('data-state', 'checked');
    });
    await screen.findByText('Failed to deactivate product Existing product.');
  });
});
