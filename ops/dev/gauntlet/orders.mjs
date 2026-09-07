import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runOrdersConfirmation } from './orders-confirmation.mjs';
import { runOrdersFulfillment } from './orders-fulfillment.mjs';

const requireAdmin = createRequire(new URL('../../../apps/admin/package.json', import.meta.url));

export async function run(ctx) {
  let sequence = 0;
  let productId;

  const scenario = (id, title, work) =>
    ctx.test(`orders-${id}`, title, async (t) => {
      const { page, context, log, save } = t;
      await ctx.loginAdmin(page);
      const request = async (path, method = 'GET', data, accepted = [200]) => {
        const response = await context.request.fetch(`${ctx.urls.admin}${path}`, {
          method,
          data,
          headers: { origin: ctx.urls.admin },
          timeout: 60000,
        });
        const text = await response.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = { text: text.slice(0, 1000) };
        }
        log(`${method} ${path}: ${response.status()}`);
        assert.ok(
          accepted.includes(response.status()),
          `${method} ${path}: ${response.status()} ${JSON.stringify(body)}`,
        );
        return body;
      };
      const create = async (overrides = {}) => {
        if (!productId) {
          const rows = String(await ctx.query("SELECT id FROM products WHERE slug='qa-drill'"));
          productId = rows
            .split('\n')
            .find((line) => /^\d+$/.test(line.trim()))
            ?.trim();
          assert.ok(productId, 'Fixture qa-drill is required.');
        }
        sequence += 1;
        const suffix = `${ctx.runId.slice(0, 8)}-${sequence}`;
        const phone = `055${String((Date.now() + sequence) % 10000000).padStart(7, '0')}`;
        const data = {
          firstName: 'Gauntlet',
          lastName: `Order-${suffix}`,
          email: `order-${suffix}@example.invalid`,
          phoneNumber1: phone,
          cartProducts: [productId],
          delivery: 0,
          state: 16,
          city: 'Alger Centre',
          homeAddress: `12 rue QA ${suffix}`,
          ...overrides,
        };
        const response = await context.request.post(`${ctx.urls.storefront}/api/orders`, {
          data,
          headers: {
            'idempotency-key': randomUUID(),
            origin: ctx.urls.storefront,
            // Local requests model distinct customers; production's edge sets this header.
            'x-real-ip': `198.19.${Number.parseInt(ctx.runId.slice(0, 2), 16)}.${sequence}`,
          },
          timeout: 60000,
        });
        const body = await response.json();
        assert.equal(response.status(), 201, `Create synthetic order: ${JSON.stringify(body)}`);
        const order = { ...body.item, input: data };
        assert.ok(Number.isSafeInteger(Number(order.id)));
        await save(`created-${order.id}.json`, order);
        return order;
      };
      const detail = async (order) => (await request(`/api/orders/${order.id}`)).item;
      const patch = async (order, data) =>
        (await request(`/api/orders/${order.id}`, 'PATCH', data)).item;
      const searchUi = async (value) => {
        const response = page.waitForResponse((r) => {
          const url = new URL(r.url());
          return url.pathname === '/api/orders' && url.searchParams.get('search') === value;
        });
        await page.getByPlaceholder('Search customer, phone, city, or product').fill(value);
        const result = await response;
        assert.equal(result.status(), 200);
        return result.json();
      };
      const show = async (order) => {
        await page.goto(`${ctx.urls.admin}/en/orders`, { waitUntil: 'domcontentloaded' });
        await searchUi(order.input.lastName);
        await t
          .expect(page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first())
          .toBeVisible();
      };
      const pollJob = async (path, job) => {
        let current;
        await t.expect
          .poll(
            async () => {
              current = (
                await request(
                  `${path}${path.includes('?') ? '&' : '?'}jobId=${encodeURIComponent(job.id)}`,
                )
              ).job;
              assert.ok(!['failed', 'cancelled'].includes(current.status), JSON.stringify(current));
              return current.status;
            },
            { timeout: 120000, intervals: [1000, 2000] },
          )
          .toBe('completed');
        await save(`job-${job.id}.json`, current);
        return current;
      };
      const prepareDispatch = async (order) => {
        const item = await detail(order);
        const stateResponse = await context.request.get(`${ctx.urls.mocks}/__demo/state`);
        assert.equal(stateResponse.status(), 200);
        const state = await stateResponse.json();
        const shipment = state.shipments.find(
          (entry) => entry.tracking === item.ecotrackTrackingNumber,
        );
        assert.ok(shipment, 'Worker-created shipment must exist in the provider simulator.');
        assert.equal(shipment.reference, String(order.id));
        assert.equal(shipment.provider, 'delivro');
        const ready = { ...shipment, status: 'prete_a_expedier' };
        const changed = await context.request.post(`${ctx.urls.mocks}/__demo/shipments`, {
          data: { shipments: [ready] },
        });
        assert.equal(changed.status(), 200);
        await save('simulated-carrier-ready.json', { before: shipment, after: ready });
        log(
          `Simulator moved only ${shipment.tracking} to ready for dispatch; subsequent actions use normal admin routes.`,
        );
        const refreshed = (
          await request(`/api/orders/ecotrack/shipments/${order.id}/refresh`, 'POST')
        ).item;
        assert.equal(refreshed.status.currentStatus, 'prete_a_expedier');
        assert.equal(refreshed.canDispatch, true);
      };
      await work({
        ...t,
        request,
        create,
        detail,
        patch,
        show,
        searchUi,
        pollJob,
        prepareDispatch,
      });
    });
  await runOrdersConfirmation({ scenario, productId });
  await runOrdersFulfillment({ scenario, ctx, requireAdmin });
}
