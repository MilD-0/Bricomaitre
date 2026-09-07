import { randomUUID } from 'node:crypto';
export async function runManagementCatalog({
  ctx,
  api,
  name,
  ok,
  createCategory,
  createProduct,
  publicProduct,
}) {
  await ctx.test(
    'management-anonymous',
    'Anonymous callers cannot read or mutate operational data',
    async ({ context, expect, save }) => {
      const results = [];
      for (const path of [
        '/api/products?limit=1',
        '/api/inventory?limit=1',
        '/api/settings/roles',
        '/api/stats/workspace',
        '/api/bulletin',
        '/api/ai/conversations',
        '/api/assets',
        '/api/landing-pages',
      ]) {
        const result = await api(context.request, path);
        results.push({ path, status: result.status });
        expect([401, 403], path).toContain(result.status);
      }
      const mutation = await api(context.request, '/api/products', {
        method: 'POST',
        data: { title: name('unauthorized'), price: 1 },
      });
      expect([401, 403]).toContain(mutation.status);
      save('anonymous-guards', results);
    },
  );
  await ctx.test(
    'management-restricted-roles',
    'Viewer and order-operator sessions cannot change catalog or administration',
    async ({ context, expect, save }) => {
      const results = [];
      for (const user of ['demo-viewer', 'demo-amine']) {
        await context.clearCookies();
        await ctx.loginAs(context, user);
        for (const [path, data] of [
          ['/api/products', { title: name('forbidden'), price: 1 }],
          ['/api/settings/roles', { name: name('forbidden'), permissions: ['settings_manage'] }],
          ['/api/storefront-settings', {}],
        ]) {
          const result = await api(context.request, path, {
            method: path.includes('storefront-settings') ? 'PUT' : 'POST',
            data,
          });
          results.push({ user, path, status: result.status });
          expect(result.status, `${user} ${path}`).toBe(403);
        }
        const bulletin = await api(context.request, '/api/bulletin');
        expect(
          bulletin.status,
          'A restricted session must still be a valid authenticated app user',
        ).toBe(200);
      }
      save('role-guards', results);
    },
  );
  await ctx.test(
    'management-brand-editor',
    'Brand creation in the UI survives reload and preserves its audit actor',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const title = name('brand');
      await page.goto(`${ctx.urls.admin}/en/brands`);
      await page.getByRole('button', { name: /create brand/i }).click();
      await page.locator('#taxonomy2-name').fill(title);
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/api/brands') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /^save$/i }).click();
      expect((await response).ok()).toBeTruthy();
      await page.reload();
      await page.getByPlaceholder(/search/i).fill(title);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      const list = ok(
        await api(context.request, `/api/brands?search=${encodeURIComponent(title)}`),
        expect,
      );
      const brand = list.items.find((item) => item.name === title);
      expect(brand.createdBy).toBeTruthy();
      expect(brand.updatedAt).toBeTruthy();
      save('brand', brand);
    },
  );
  await ctx.test(
    'management-category-cycle',
    'Category hierarchy rejects a cycle and retains Arabic labels and parentage',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const parent = await createCategory(context.request, expect, 'parent');
      const child = await createCategory(context.request, expect, 'child', Number(parent.id));
      const cycle = await api(context.request, `/api/categories/${parent.id}`, {
        method: 'PATCH',
        data: { parentId: Number(child.id) },
      });
      expect(cycle.status, JSON.stringify(cycle.body)).toBe(409);
      const parentAfter = ok(await api(context.request, `/api/categories/${parent.id}`), expect);
      const childAfter = ok(await api(context.request, `/api/categories/${child.id}`), expect);
      expect(parentAfter.parentId).toBeNull();
      expect(String(childAfter.parentId)).toBe(String(parent.id));
      expect(childAfter.nameAr).toBe('فئة الاختبار');
      save('hierarchy', { parentAfter, childAfter, cycle });
    },
  );
  await ctx.test(
    'management-product-publication',
    'Admin price and visibility edits propagate to the public API and product page',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'publication');
      let publicResponse = await publicProduct(context.request, product);
      expect(publicResponse.status()).toBe(200);
      const before = await publicResponse.json();
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PUT',
          data: { ...product.payload, price: 6125 },
        }),
        expect,
      );
      await expect
        .poll(async () =>
          Number((await (await publicProduct(context.request, product)).json()).item.price),
        )
        .toBe(6125);
      await page.goto(`${ctx.urls.storefront}/fr/products/${product.slug || product.id}`);
      await expect(page.getByRole('heading', { name: product.title, exact: true })).toBeVisible();
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PATCH',
          data: { active: false },
        }),
        expect,
      );
      await expect
        .poll(async () => (await publicProduct(context.request, product)).status())
        .toBe(404);
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PATCH',
          data: { active: true },
        }),
        expect,
      );
      await expect
        .poll(async () => (await publicProduct(context.request, product)).status())
        .toBe(200);
      save('product-publication', {
        productId: product.id,
        before,
        after: await (await publicProduct(context.request, product)).json(),
      });
    },
  );
  await ctx.test(
    'management-inventory-retry',
    'Replayed inventory batches apply once and reject changed payloads under the same key',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'inventory retry');
      const data = {
        requestId: randomUUID(),
        mode: 'decrease',
        items: [{ productId: product.id, quantity: 3 }],
      };
      const first = ok(
        await api(context.request, '/api/inventory/apply', { method: 'POST', data }),
        expect,
      );
      const replay = ok(
        await api(context.request, '/api/inventory/apply', { method: 'POST', data }),
        expect,
      );
      expect(replay.items).toEqual(first.items);
      const changed = await api(context.request, '/api/inventory/apply', {
        method: 'POST',
        data: { ...data, items: [{ productId: product.id, quantity: 4 }] },
      });
      expect(changed.status).toBe(409);
      const current = ok(await api(context.request, `/api/products/${product.id}`), expect).item;
      expect(current.inventoryQuantity).toBe(17);
      const scan = ok(
        await api(context.request, '/api/inventory/scan', {
          method: 'POST',
          data: { query: product.barcode },
        }),
        expect,
      );
      expect(scan.kind).toBe('barcode');
      expect(scan.item.id).toBe(product.id);
      expect(scan.item.inventoryQuantity).toBe(17);
      save('inventory-retry', { first, replay, changed, scan });
    },
  );
  await ctx.test(
    'management-inventory-overdraw',
    'An excessive stock deduction is skipped without reducing stored stock',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'overdraw', {
        inventoryQuantity: 2,
      });
      const result = ok(
        await api(context.request, '/api/inventory/apply', {
          method: 'POST',
          data: {
            requestId: randomUUID(),
            mode: 'decrease',
            items: [{ productId: product.id, quantity: 3 }],
          },
        }),
        expect,
      );
      expect(result.items).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(
        ok(await api(context.request, `/api/products/${product.id}`), expect).item
          .inventoryQuantity,
      ).toBe(2);
      save('overdraw', result);
    },
  );
  await ctx.test(
    'management-product-archive',
    'Archiving removes a product from public discovery and restore recovers the same record',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'archive');
      ok(await api(context.request, `/api/products/${product.id}`, { method: 'DELETE' }), expect);
      expect((await publicProduct(context.request, product)).status()).toBe(404);
      const list = ok(
        await api(context.request, `/api/products?search=${encodeURIComponent(product.title)}`),
        expect,
      );
      const archivedStillListed = list.items.some((item) => item.id === product.id);
      ok(
        await api(context.request, `/api/products/${product.id}/restore`, { method: 'POST' }),
        expect,
      );
      const restored = ok(await api(context.request, `/api/products/${product.id}`), expect).item;
      expect(restored.title).toBe(product.title);
      expect(restored.inventoryQuantity).toBe(20);
      expect(restored.active).toBe(false);
      expect((await publicProduct(context.request, product)).status()).toBe(404);
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PATCH',
          data: { active: true },
        }),
        expect,
      );
      expect((await publicProduct(context.request, product)).status()).toBe(200);
      save('restored-product', {
        restored,
        archivedStillListed,
        immediateList: list.items.map((item) => item.id),
      });
      expect(
        archivedStillListed,
        'A successful archive must disappear on the first subsequent admin search',
      ).toBe(false);
    },
  );
}
