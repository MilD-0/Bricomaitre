import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';

import type { ShoppingListAllocationReview } from '../../lib/shopping-list-stock-allocations';
import { server } from '../../test/mocks/server';
import { ShoppingInventoryReviewDialog } from './shopping-inventory-review';

const endpoint = '/api/orders/shopping-list-draft/review';
const firstProduct = {
  productId: 7,
  title: 'Drill',
  recordedQuantity: 4,
  manualAppliedQuantity: 0,
  orders: [
    { orderId: 11, requiredQuantity: 3, currentAppliedQuantity: 1 },
    { orderId: 12, requiredQuantity: 2, currentAppliedQuantity: 0 },
  ],
};
const firstReview = {
  scopeKey: 'selected:11,12',
  revision: 3,
  title: 'Selected orders',
  products: [firstProduct],
};

function renderReview(data: ShoppingListAllocationReview = { reviews: [firstReview] }) {
  server.use(http.get(endpoint, () => HttpResponse.json(data)));
  const onReviewed = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{}}>
        <ShoppingInventoryReviewDialog
          open
          onOpenChange={onOpenChange}
          sourceMode="selected"
          orderIds={[11, 12]}
          onReviewed={onReviewed}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onReviewed, onOpenChange };
}

function assign(orderId: number, value: string) {
  fireEvent.change(
    screen.getByRole('spinbutton', { name: `Deducted in this list · #${orderId}` }),
    {
      target: { value },
    },
  );
}

it('requires whole nonnegative allocations whose total equals the recorded deduction', async () => {
  const posts = vi.fn();
  server.use(http.post(endpoint, posts));
  renderReview();
  const save = await screen.findByRole('button', { name: 'Save attribution' });
  expect(save).toBeDisabled();
  assign(11, '3');
  expect(screen.getByText('Assigned total: 3 / 4')).toBeInTheDocument();
  expect(save).toBeDisabled();
  assign(12, '2');
  expect(save).toBeDisabled();
  assign(11, '2');
  expect(save).toBeEnabled();
  assign(11, '1.5');
  assign(12, '2.5');
  expect(save).toBeDisabled();
  assign(11, '-1');
  assign(12, '5');
  expect(save).toBeDisabled();
  expect(posts).not.toHaveBeenCalled();
});

it('retries explicit order and manual quantities with the same request ID after response loss', async () => {
  const user = userEvent.setup();
  const bodies: Record<string, unknown>[] = [];
  let resolved = false;
  const { onReviewed } = renderReview();
  server.use(
    http.get(endpoint, () => HttpResponse.json({ reviews: resolved ? [] : [firstReview] })),
    http.post(endpoint, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      if (bodies.length === 1) return HttpResponse.error();
      resolved = true;
      return HttpResponse.json({ ok: true });
    }),
  );
  await screen.findByRole('button', { name: 'Save attribution' });
  assign(11, '2');
  assign(12, '1');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Manual additions' }), {
    target: { value: '1' },
  });
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await screen.findByRole('alert');
  expect(onReviewed).not.toHaveBeenCalled();
  expect(screen.getByRole('spinbutton', { name: 'Manual additions' })).toHaveValue(1);
  expect(screen.getByRole('spinbutton', { name: 'Manual additions' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await screen.findByText('All previous deductions have been reviewed.');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual({
    scopeKey: firstReview.scopeKey,
    revision: 3,
    productId: 7,
    requestId: expect.any(String),
    orders: [
      { orderId: 11, quantity: 2 },
      { orderId: 12, quantity: 1 },
    ],
    manualQuantity: 1,
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(onReviewed).toHaveBeenCalledOnce();
});

it('refetches unresolved products across scopes and uses each current revision', async () => {
  const user = userEvent.setup();
  const secondProduct = { ...firstProduct, productId: 8, title: 'Saw', recordedQuantity: 1 };
  const otherReview = {
    ...firstReview,
    scopeKey: 'status:confirmed',
    title: 'Confirmed',
    revision: 9,
  };
  let data: ShoppingListAllocationReview = {
    reviews: [{ ...firstReview, products: [firstProduct, secondProduct] }, otherReview],
  };
  const bodies: Array<{
    scopeKey: string;
    productId: number;
    revision: number;
    requestId: string;
  }> = [];
  const { onReviewed, onOpenChange } = renderReview(data);
  server.use(
    http.get(endpoint, ({ request }) => {
      const search = new URL(request.url).searchParams;
      expect(search.get('sourceMode')).toBe('selected');
      expect(search.getAll('orderIds')).toEqual(['11', '12']);
      return HttpResponse.json(data);
    }),
    http.post(endpoint, async ({ request }) => {
      const body = (await request.json()) as (typeof bodies)[number];
      bodies.push(body);
      data = {
        reviews: data.reviews
          .map((review) =>
            review.scopeKey === body.scopeKey
              ? {
                  ...review,
                  revision: review.revision + 1,
                  products: review.products.filter((p) => p.productId !== body.productId),
                }
              : review,
          )
          .filter((review) => review.products.length > 0),
      };
      return HttpResponse.json({ ok: true });
    }),
  );
  const select = await screen.findByRole('combobox', { name: 'Product and shopping list' });
  await user.selectOptions(select, `${otherReview.scopeKey}:7`);
  assign(11, '4');
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await waitFor(() => expect(select).toHaveValue(`${firstReview.scopeKey}:7`));
  expect(screen.getByRole('spinbutton', { name: 'Deducted in this list · #11' })).toHaveValue(null);
  assign(11, '4');
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await waitFor(() => expect(select).toHaveValue(`${firstReview.scopeKey}:8`));
  assign(11, '1');
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await screen.findByText('All previous deductions have been reviewed.');
  expect(
    bodies.map(({ scopeKey, productId, revision }) => ({ scopeKey, productId, revision })),
  ).toEqual([
    { scopeKey: otherReview.scopeKey, productId: 7, revision: 9 },
    { scopeKey: firstReview.scopeKey, productId: 7, revision: 3 },
    { scopeKey: firstReview.scopeKey, productId: 8, revision: 4 },
  ]);
  expect(new Set(bodies.map((body) => body.requestId)).size).toBe(3);
  expect(onReviewed).toHaveBeenCalledTimes(3);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('reloads authoritative review at the same revision and resets locked quantities and request ID', async () => {
  const user = userEvent.setup();
  const bodies: Array<{ requestId: string }> = [];
  renderReview();
  server.use(
    http.get(endpoint, () => HttpResponse.json({ reviews: [firstReview] })),
    http.post(endpoint, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      return HttpResponse.json(
        { error: 'Shopping list changed. Reload before saving.' },
        { status: 409 },
      );
    }),
  );
  await screen.findByRole('button', { name: 'Save attribution' });
  assign(11, '4');
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Shopping list changed.');
  expect(screen.getByRole('spinbutton', { name: 'Deducted in this list · #11' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByRole('spinbutton', { name: 'Deducted in this list · #11' })).toHaveValue(null);
  expect(screen.getByRole('button', { name: 'Save attribution' })).toBeDisabled();
  assign(11, '3');
  assign(12, '1');
  await user.click(screen.getByRole('button', { name: 'Save attribution' }));
  await screen.findByRole('alert');
  expect(bodies).toHaveLength(2);
  expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
});
