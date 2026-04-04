import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import messages from '../messages/en.json';
import { toast } from '../lib/toast';
import { server } from '../test/mocks/server';
import { InventoryManager } from './inventory-manager';
import { Toaster } from './ui/toaster';

describe('InventoryManager', () => {
  const patchCalls: Array<{ id: number; body: unknown }> = [];

  beforeEach(() => {
    patchCalls.length = 0;

    let items = [
      {
        id: 1,
        title: 'Hammer',
        sku: 'HAM-1',
        barcode: '123456',
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 2,
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Wrench',
        sku: 'WRE-1',
        barcode: null,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        inventoryQuantity: 0,
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    ];

    server.use(
      http.get('/api/inventory', async ({ request }) => {
        await delay(20);
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        const search = url.searchParams.get('search') ?? '';

        const filtered = search
          ? items.filter((item) => [item.title, item.sku, item.barcode].filter(Boolean).some((value) => value?.toLowerCase().includes(search.toLowerCase())))
          : items.filter((item) => item.inventoryQuantity > 0);

        const perPage = search ? 50 : 50;
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        return HttpResponse.json({
          writable: true,
          items: pageItems,
          pagination: {
            page,
            limit: perPage,
            totalItems: filtered.length,
            totalPages: Math.max(1, Math.ceil(filtered.length / perPage)),
            hasNextPage: start + perPage < filtered.length,
            hasPreviousPage: page > 1,
          },
        });
      }),
      http.patch('/api/inventory/:id', async ({ request, params }) => {
        await delay(20);
        const body = await request.json() as { delta?: number; inStock?: boolean; barcode?: string | null };
        const id = Number(params.id);
        patchCalls.push({ id, body });

        items = items.map((item) => {
          if (item.id !== id) {
            return item;
          }

          const inventoryQuantity = body.delta == null ? item.inventoryQuantity : Math.max(0, item.inventoryQuantity + body.delta);

          return {
            ...item,
            inventoryQuantity,
            inStock: body.inStock ?? item.inStock,
            barcode: body.barcode === undefined ? item.barcode : body.barcode,
            updatedAt: '2026-03-21T00:01:00.000Z',
          };
        });

        return HttpResponse.json({ ok: true, item: items.find((item) => item.id === id) });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    toast.clear();
  });

  function renderInventoryManager() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <InventoryManager title="Inventory" />
          <Toaster />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('renders the inventory table with pagination and hides zero-quantity items by default', async () => {
    renderInventoryManager();

    expect(await screen.findByText('Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Wrench')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('supports sorting by product, quantity, and in-stock columns', async () => {
    renderInventoryManager();

    await screen.findByText('Hammer');

    const searchField = screen.getByPlaceholderText('Search by product, SKU, or barcode');
    await userEvent.type(searchField, 'r');

    expect(await screen.findByText('Wrench')).toBeInTheDocument();

    const getProductOrder = () =>
      screen.getAllByRole('row').slice(1).map((row) => within(row).getByText(/Hammer|Wrench/).textContent);

    expect(getProductOrder()).toEqual(['Hammer', 'Wrench']);

    await userEvent.click(screen.getByRole('button', { name: 'Product' }));
    expect(getProductOrder()).toEqual(['Wrench', 'Hammer']);

    await userEvent.click(screen.getByRole('button', { name: 'Inventory quantity' }));
    expect(getProductOrder()).toEqual(['Hammer', 'Wrench']);

    await userEvent.click(screen.getByRole('button', { name: 'Inventory quantity' }));
    expect(getProductOrder()).toEqual(['Wrench', 'Hammer']);

    await userEvent.click(screen.getByRole('button', { name: 'In stock' }));
    expect(getProductOrder()).toEqual(['Hammer', 'Wrench']);

    await userEvent.click(screen.getByRole('button', { name: 'In stock' }));
    expect(getProductOrder()).toEqual(['Wrench', 'Hammer']);
  });

  it('supports barcode add and inventory controls from the table', async () => {
    renderInventoryManager();

    await screen.findByText('Hammer');

    await userEvent.click(screen.getByRole('button', { name: '123456' }));
    const dialog = await screen.findByRole('dialog');
    const barcodeField = within(dialog).getByRole('textbox', { name: 'Barcode' });
    await userEvent.clear(barcodeField);
    await userEvent.type(barcodeField, '654321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await screen.findByText('Updated barcode for Hammer.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({ id: 1, body: { barcode: '654321' } });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity for Hammer' }));
    await screen.findByText('Increased quantity for Hammer.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({ id: 1, body: { delta: 1 } });
    });

    await userEvent.click(screen.getByRole('switch', { name: 'Toggle in-stock for Hammer' }));
    await screen.findByText('Marked Hammer as out of stock.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({ id: 1, body: { inStock: false } });
    });
  });

  it('lets search reveal hidden products and scan them back into inventory', async () => {
    renderInventoryManager();

    await screen.findByText('Hammer');

    const searchField = screen.getByPlaceholderText('Search by product, SKU, or barcode');
    await userEvent.clear(searchField);
    await userEvent.type(searchField, 'Wrench');

    expect(await screen.findByText('Wrench')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Barcode' }), '999999');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await screen.findByText('Added barcode for Wrench.');

    await userEvent.clear(searchField);
    await userEvent.type(searchField, '999999');
    expect(await screen.findByText('Wrench')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity for Wrench' }));

    await screen.findByText('Increased quantity for Wrench.');

    await waitFor(() => {
      expect(patchCalls).toContainEqual({ id: 2, body: { barcode: '999999' } });
      expect(patchCalls).toContainEqual({ id: 2, body: { delta: 1 } });
    });
  });
});
