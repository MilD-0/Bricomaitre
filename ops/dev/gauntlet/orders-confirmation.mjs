import assert from 'node:assert/strict';
export async function runOrdersConfirmation({ scenario, productId }) {
  await scenario(
    'handoff',
    'Customer order preserves products, delivery fee and identity in admin',
    async ({ create, detail, show, expect, page, save }) => {
      const order = await create();
      const item = await detail(order);
      await save('admin-order.json', item);
      assert.equal(item.publicToken, order.publicToken);
      assert.equal(item.fullName, `Gauntlet ${order.input.lastName}`);
      assert.equal(item.productSubtotal, 4500);
      assert.equal(item.deliveryFee, 600);
      assert.equal(item.totalAmount, 5100);
      assert.equal(item.orderProducts[0].quantity, 1);
      await show(order);
      await expect(page.getByText(`#${order.id}`, { exact: true }).first()).toBeVisible();
    },
  );
  await scenario(
    'phone-local',
    'Saving an order keeps its local phone number searchable',
    async ({ create, show, page, expect, detail, save, searchUi }) => {
      const order = await create();
      await show(order);
      await page
        .getByRole('button')
        .filter({ hasText: `Gauntlet ${order.input.lastName}` })
        .first()
        .click();
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await expect(saveButton).toBeVisible();
      await page
        .locator('form')
        .filter({ has: saveButton })
        .locator('select')
        .first()
        .selectOption('2');
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/orders/${order.id}`) &&
          response.request().method() === 'PATCH',
      );
      await saveButton.click();
      assert.equal((await saved).status(), 200);
      await expect(saveButton).toBeDisabled();
      await save('saved-order.json', await detail(order));
      const results = await searchUi(order.input.phoneNumber1);
      await save('local-phone-results.json', results);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'Saving must preserve searchability by the original phone.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );
  await scenario(
    'international-preservation',
    'Confirming an international-phone order preserves a valid customer number',
    async ({ create, show, page, detail, save }) => {
      const phone = `+21355${String(Date.now() % 10000000).padStart(7, '0')}`;
      const order = await create({ phoneNumber1: phone });
      await show(order);
      await page
        .getByRole('button')
        .filter({ hasText: `Gauntlet ${order.input.lastName}` })
        .first()
        .click();
      const displayed = await page.locator('input[inputmode="tel"]').inputValue();
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await page
        .locator('form')
        .filter({ has: saveButton })
        .locator('select')
        .first()
        .selectOption('2');
      const saved = page.waitForResponse(
        (r) => r.url().endsWith(`/api/orders/${order.id}`) && r.request().method() === 'PATCH',
      );
      await saveButton.click();
      assert.equal((await saved).status(), 200);
      const after = await detail(order);
      await save('international-phone.json', { original: phone, displayed, after });
      assert.equal(
        after.phoneNumber1,
        phone,
        'Changing only order status must preserve the customer international phone.',
      );
      assert.equal(displayed, phone, 'The call field must display a valid international phone.');
    },
  );
  await scenario(
    'phone-international',
    'International phone searches find orders entered in local format',
    async ({ create, show, page, expect, request, save, searchUi }) => {
      const order = await create();
      const search = `+213${order.input.phoneNumber1.slice(1)}`;
      await save(
        'search-response.json',
        await request(`/api/orders?search=${encodeURIComponent(search)}`),
      );
      await show(order);
      const results = await searchUi(search);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'International phone format must find the same customer.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );
  await scenario(
    'search-id',
    'An operator can find an order using its displayed reference',
    async ({ create, show, page, expect, request, save, searchUi }) => {
      const order = await create();
      await save('search-response.json', await request(`/api/orders?search=${order.id}`));
      await show(order);
      const results = await searchUi(`#${order.id}`);
      await save('reference-results.json', results);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'Displayed order reference must be searchable.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );
  await scenario(
    'call-history',
    'No-answer attempts, confirmation and cancellation retain accountable history',
    async ({ create, patch, detail, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 1, noAnswerCount: 1 });
      await patch(order, { inHouseStatus: 1, noAnswerCount: 2 });
      const confirmed = await patch(order, { inHouseStatus: 2 });
      assert.ok(confirmed.confirmedBy && confirmed.confirmedAt);
      await patch(order, { inHouseStatus: 6, note: 'Customer cancelled during QA call' });
      const item = await detail(order);
      await save('history.json', item);
      assert.equal(item.inHouseStatus, 6);
      for (const status of [1, 2, 6])
        assert.ok(
          item.statusHistory.some(
            (entry) => entry.status === status && entry.changedBy && entry.changedAt,
          ),
        );
      assert.ok(
        item.statusHistory.some((entry) => entry.status === 1 && entry.noAnswerCount === 2),
      );
      assert.equal(item.totalAmount, 5100);
    },
  );
  await scenario(
    'status-filters',
    'Status and no-answer filters return the correct operational queue',
    async ({ create, patch, request, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 1, noAnswerCount: 2 });
      const suffix = encodeURIComponent(order.input.lastName);
      const matching = await request(
        `/api/orders?search=${suffix}&inHouseStatus=1&noAnswerCountMin=2`,
      );
      const excluded = await request(`/api/orders?search=${suffix}&inHouseStatus=2`);
      await save('filters.json', { matching, excluded });
      assert.ok(matching.items.some((item) => item.id === Number(order.id)));
      assert.ok(!excluded.items.some((item) => item.id === Number(order.id)));
    },
  );
  await scenario(
    'commercial-edits',
    'Quantity and delivery edits recalculate all commercial values coherently',
    async ({ create, patch, detail, save }) => {
      const order = await create();
      const quantity = await patch(order, { cartProducts: [productId, productId] });
      assert.equal(quantity.productSubtotal, 9000);
      assert.equal(quantity.totalAmount, 9600);
      assert.equal(quantity.orderProducts[0].quantity, 2);
      const pickup = await patch(order, { delivery: 1 });
      assert.equal(pickup.totalAmount, 9000 + pickup.deliveryFee);
      const restored = await patch(order, { delivery: 0, cartProducts: [productId] });
      assert.equal(restored.totalAmount, 5100);
      await save('edited-order.json', await detail(order));
    },
  );
}
