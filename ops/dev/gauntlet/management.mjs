import { randomUUID } from 'node:crypto';

// These journeys own only records named with this run's unique prefix.
export async function run(ctx) {
  const prefix = `Gauntlet ${ctx.runId}`.slice(0, 46);
  let serial = 0;
  const name = (label) => `${prefix} ${label} ${++serial}`;
  const api = async (request, path, options = {}) => {
    const response = await request.fetch(`${ctx.urls.admin}${path}`, {
      timeout: 60000,
      ...options,
    });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw.slice(0, 2000);
    }
    return { status: response.status(), body };
  };
  const ok = (result, expect) => {
    expect(result.status, JSON.stringify(result.body)).toBeGreaterThanOrEqual(200);
    expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
    return result.body;
  };
  const createProduct = async (request, expect, label, overrides = {}) => {
    const title = name(label);
    const data = {
      title,
      titleAr: 'منتج اختبار',
      description: 'Synthetic management QA product.',
      price: 4750,
      purchasePrice: 2750,
      inventoryQuantity: 20,
      active: true,
      inStock: true,
      sku: randomUUID(),
      barcode: randomUUID(),
      images: [],
      ...overrides,
    };
    ok(await api(request, '/api/products', { method: 'POST', data }), expect);
    const list = ok(
      await api(request, `/api/products?search=${encodeURIComponent(title)}&limit=50`),
      expect,
    );
    const item = list.items.find((candidate) => candidate.title === title);
    expect(item, 'Created product must be searchable immediately').toBeTruthy();
    return { ...item, payload: data };
  };
  const publicProduct = (request, product) =>
    request.get(`${ctx.urls.api}/storefront/products/${product.id}`);
  const createCategory = async (request, expect, label, parentId) => {
    const title = name(label);
    ok(
      await api(request, '/api/categories', {
        method: 'POST',
        data: { name: title, nameAr: 'فئة الاختبار', parentId },
      }),
      expect,
    );
    const list = ok(
      await api(
        request,
        `/api/categories?search=${encodeURIComponent(title)}&includeParentOptions=1`,
      ),
      expect,
    );
    const item = list.items.find((candidate) => candidate.name === title);
    expect(item).toBeTruthy();
    return item;
  };

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

  await ctx.test(
    'management-landing-publish',
    'Landing draft, publish, stale-save protection and unpublish reach the customer page',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'landing');
      const created = ok(
        await api(context.request, '/api/landing-pages', {
          method: 'POST',
          data: { productId: product.id, locale: 'fr' },
        }),
        expect,
      );
      const detail = ok(await api(context.request, `/api/landing-pages/${created.id}`), expect);
      const publicUrl = `${ctx.urls.storefront}/fr/landing/${detail.slug}`;
      const landingApiUrl = `${ctx.urls.api}/storefront/landing-pages/${detail.slug}?locale=fr`;
      expect((await context.request.get(landingApiUrl)).status()).toBe(404);
      const published = ok(
        await api(context.request, `/api/landing-pages/${created.id}`, {
          method: 'PATCH',
          data: { action: 'set-active', active: true, expectedRevision: detail.currentRevision },
        }),
        expect,
      );
      await expect.poll(async () => (await context.request.get(landingApiUrl)).status()).toBe(200);
      await page.goto(publicUrl);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const document = structuredClone(detail.document);
      document.seo.title = 'Gauntlet changed campaign';
      const saved = ok(
        await api(context.request, `/api/landing-pages/${created.id}`, {
          method: 'PATCH',
          data: {
            action: 'save-active',
            document,
            active: true,
            expectedRevision: published.currentRevision,
          },
        }),
        expect,
      );
      const stale = await api(context.request, `/api/landing-pages/${created.id}`, {
        method: 'PATCH',
        data: {
          action: 'save-active',
          document: detail.document,
          active: true,
          expectedRevision: published.currentRevision,
        },
      });
      expect(stale.status).toBe(409);
      await page.reload();
      const titleAfterSave = await page.title();
      ok(
        await api(context.request, `/api/landing-pages/${created.id}`, {
          method: 'PATCH',
          data: { action: 'set-active', active: false, expectedRevision: saved.currentRevision },
        }),
        expect,
      );
      const unpublishedAt = Date.now();
      await page.reload();
      const titleAfterUnpublish = await page.title();
      const orderFormAfterUnpublish = await page.locator('#landing-order').count();
      const browserReadAfterUnpublishMs = Date.now() - unpublishedAt;
      await expect.poll(async () => (await context.request.get(landingApiUrl)).status()).toBe(404);
      save('landing-lifecycle', {
        id: created.id,
        slug: detail.slug,
        published,
        saved,
        stale,
        titleAfterSave,
        titleAfterUnpublish,
        orderFormAfterUnpublish,
        browserReadAfterUnpublishMs,
      });
      expect(
        {
          savedTitleVisible: titleAfterSave.includes('Gauntlet changed campaign'),
          unpublishedOrderFormVisible: orderFormAfterUnpublish > 0,
        },
        'Published copy must refresh after save and an unpublished campaign must lose its order form',
      ).toEqual({ savedTitleVisible: true, unpublishedOrderFormVisible: false });
    },
  );

  await ctx.test(
    'management-bulletin',
    'Bulletin post edits, replies and reaction reversal survive browser reload',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const title = name('bulletin');
      const tag = `qa${randomUUID().slice(0, 8)}`;
      ok(
        await api(context.request, '/api/bulletin', {
          method: 'POST',
          data: { title, body: 'Synthetic operational bulletin for the gauntlet.', tags: [tag] },
        }),
        expect,
      );
      const list = ok(await api(context.request, `/api/bulletin?tag=${tag}`), expect);
      const post = list.posts.find((item) => item.title === title);
      expect(post).toBeTruthy();
      ok(
        await api(context.request, `/api/bulletin/${post.id}`, {
          method: 'PATCH',
          data: { body: 'Edited bulletin with persisted operator instructions.' },
        }),
        expect,
      );
      ok(
        await api(context.request, `/api/bulletin/${post.id}/replies`, {
          method: 'POST',
          data: { body: 'Acknowledged by synthetic operator.' },
        }),
        expect,
      );
      const reaction1 = ok(
        await api(context.request, `/api/bulletin/${post.id}/reactions`, {
          method: 'POST',
          data: { emoji: '👍' },
        }),
        expect,
      );
      const reaction2 = ok(
        await api(context.request, `/api/bulletin/${post.id}/reactions`, {
          method: 'POST',
          data: { emoji: '👍' },
        }),
        expect,
      );
      expect(reaction1.reacted).toBe(true);
      expect(reaction2.reacted).toBe(false);
      const after = ok(await api(context.request, `/api/bulletin?tag=${tag}`), expect).posts.find(
        (item) => item.id === post.id,
      );
      expect(after.body).toBe('Edited bulletin with persisted operator instructions.');
      expect(
        after.replies.some((item) => item.body === 'Acknowledged by synthetic operator.'),
      ).toBe(true);
      await page.goto(`${ctx.urls.admin}/en/bulletin`);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      save('bulletin', after);
    },
  );

  await ctx.test(
    'management-stats-render',
    'Statistics renders data and updates its date range through a real browser request',
    async ({ page, expect, save }) => {
      await ctx.loginAdmin(page);
      const started = Date.now();
      await page.setViewportSize({ width: 900, height: 900 });
      await page.goto(`${ctx.urls.admin}/en/stats?range=30d`, { timeout: 90000 });
      const workspace = page.locator('[data-admin-workspace="stats"]');
      await expect(workspace).toBeVisible({ timeout: 45000 });
      const selects = workspace.locator('select');
      const range = selects.filter({ has: page.locator('option[value="7d"]') });
      const response = page.waitForResponse(
        (r) => r.url().includes('/api/stats/workspace?') && r.url().includes('range=7d'),
        { timeout: 60000 },
      );
      await range.selectOption('7d');
      const result = await response;
      expect(result.status()).toBe(200);
      const body = await result.json();
      expect(body.data).toBeTruthy();
      await expect(workspace).not.toContainText(/NaN|Infinity/);
      save('stats-range', { elapsedMs: Date.now() - started, url: result.url(), body });
    },
  );

  await ctx.test(
    'management-stats-invalid-dates',
    'Analytics rejects impossible calendar dates before executing database queries',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const results = [];
      for (const route of ['/api/stats/workspace?view=command', '/api/stats/ai?surface=admin']) {
        const join = route.endsWith('?') ? '' : '&';
        for (const [startDate, endDate] of [
          ['2026-02-30', '2026-03-02'],
          ['2026-09-07', '2026-09-01'],
        ]) {
          const result = await api(
            context.request,
            `${route}${join}range=custom&startDate=${startDate}&endDate=${endDate}`,
          );
          results.push({ route, startDate, endDate, ...result });
          save('invalid-dates', results);
        }
      }
      expect(
        results.filter((result) => result.status !== 400),
        'Every malformed date range must receive a validation response',
      ).toEqual([]);
    },
  );

  await ctx.test(
    'management-role-definition',
    'A custom role persists exactly its permissions and duplicate creation cannot broaden it',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const title = name('role');
      const data = {
        name: title,
        description: 'Synthetic restricted audit role.',
        permissions: ['orders_write'],
      };
      ok(await api(context.request, '/api/settings/roles', { method: 'POST', data }), expect);
      const duplicate = await api(context.request, '/api/settings/roles', {
        method: 'POST',
        data: { ...data, permissions: ['settings_manage'] },
      });
      expect(duplicate.status).toBe(409);
      const roles = ok(await api(context.request, '/api/settings/roles'), expect).items.filter(
        (item) => item.name === title,
      );
      expect(roles).toHaveLength(1);
      expect(roles[0].permissions).toEqual(['orders_write']);
      save('custom-role', roles[0]);
    },
  );

  await ctx.test(
    'management-image-upload',
    'Uploaded product image remains retrievable and forged image data is rejected',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
        'base64',
      );
      const uploaded = ok(
        await api(context.request, '/api/uploads/products', {
          method: 'POST',
          multipart: { files: { name: `${ctx.runId}.png`, mimeType: 'image/png', buffer: bytes } },
        }),
        expect,
      );
      expect(uploaded.urls).toHaveLength(1);
      const url = uploaded.urls[0];
      const object = await context.request.get(url);
      expect(object.status(), url).toBe(200);
      expect((await object.body()).length).toBeGreaterThan(0);
      const product = await createProduct(context.request, expect, 'image', { images: [url] });
      const publicBody = await (await publicProduct(context.request, product)).json();
      expect(JSON.stringify(publicBody)).toContain(url);
      const invalid = await api(context.request, '/api/uploads/products', {
        method: 'POST',
        multipart: {
          files: { name: 'forged.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
        },
      });
      expect(invalid.status).toBe(400);
      save('image-upload', { uploaded, productId: product.id, invalid });
    },
  );

  await ctx.test(
    'management-ai-approve',
    'AI proposal approval enforces catalog permissions, applies once and reaches the public catalog',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai approval');
      const description = `Approved content ${ctx.runId}`;
      const proposalId = ctx.seedContentProposal(product.id, description);
      for (const user of ['demo-viewer', 'demo-amine']) {
        await ctx.loginAs(context, user);
        const denied = await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'approve' },
        });
        expect(denied.status).toBe(403);
      }
      await context.clearCookies();
      await ctx.loginAdmin(page);
      const applied = ok(
        await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'approve' },
        }),
        expect,
      );
      expect(applied.proposal.status).toBe('applied');
      expect(applied.proposal.verified).toBe(true);
      const replay = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(replay.status).toBe(409);
      expect(replay.body.code).toBe('proposal_already_reviewed');
      await expect
        .poll(
          async () =>
            (await (await publicProduct(context.request, product)).json()).item.description,
        )
        .toBe(description);
      const rows = ctx.query(
        `SELECT json_build_object('status',status,'reviewedBy',reviewed_by,'appliedAt',applied_at)::text FROM ai_proposals WHERE id=${proposalId}`,
      );
      expect(rows).toContain('operator@demo.bricomaitre.invalid');
      save('ai-approval', { proposalId, productId: product.id, applied, replay, rows });
    },
  );

  await ctx.test(
    'management-ai-stale',
    'A stale AI proposal cannot overwrite newer operator edits',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai stale');
      const proposalId = ctx.seedContentProposal(product.id, 'Obsolete generated description');
      const description = `Operator correction ${ctx.runId}`;
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PUT',
          data: { ...product.payload, description },
        }),
        expect,
      );
      const stale = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('proposal_stale');
      expect(
        ok(await api(context.request, `/api/products/${product.id}`), expect).item.description,
      ).toBe(description);
      save('ai-stale', { proposalId, productId: product.id, stale });
    },
  );

  await ctx.test(
    'management-ai-reject',
    'Rejecting an AI proposal records the decision and prevents later approval',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai rejection');
      const proposalId = ctx.seedContentProposal(
        product.id,
        'This content must never reach customers',
      );
      const rejected = ok(
        await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'reject' },
        }),
        expect,
      );
      expect(rejected.proposal.status).toBe('rejected');
      const laterApproval = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(laterApproval.status).toBe(409);
      const productAfter = ok(
        await api(context.request, `/api/products/${product.id}`),
        expect,
      ).item;
      expect(productAfter.description).toBe(product.payload.description);
      save('ai-rejection', { proposalId, productId: product.id, rejected, laterApproval });
    },
  );

  await ctx.test(
    'management-history-undo',
    'Catalog audit history undoes and redoes an edit with public values restored',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'undo');
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PUT',
          data: { ...product.payload, price: 8350 },
        }),
        expect,
      );
      const history = ok(
        await api(
          context.request,
          `/api/action-history?resource=products&operation=update&search=${encodeURIComponent(product.title)}&limit=50`,
        ),
        expect,
      );
      const entry = history.items.find((item) => Number(item.entityId) === product.id);
      expect(entry, 'Product price edit must have a reversible history record').toBeTruthy();
      expect(entry.isReversible).toBe(true);
      const undo = ok(
        await api(context.request, `/api/action-history/${entry.id}/undo`, { method: 'POST' }),
        expect,
      );
      expect(
        Number(ok(await api(context.request, `/api/products/${product.id}`), expect).item.price),
      ).toBe(product.payload.price);
      await expect
        .poll(async () =>
          Number((await (await publicProduct(context.request, product)).json()).item.price),
        )
        .toBe(product.payload.price);
      const redo = ok(
        await api(context.request, `/api/action-history/${entry.id}/redo`, { method: 'POST' }),
        expect,
      );
      expect(
        Number(ok(await api(context.request, `/api/products/${product.id}`), expect).item.price),
      ).toBe(8350);
      await expect
        .poll(async () =>
          Number((await (await publicProduct(context.request, product)).json()).item.price),
        )
        .toBe(8350);
      save('history-undo-redo', { productId: product.id, entry, undo, redo });
    },
  );

  await ctx.test(
    'management-operating-cost',
    'Manual operating cost creation, edit and deletion change the reporting total exactly once',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const date = new Date().toISOString().slice(0, 10);
      const reportPath = `/api/stats/profit-tracker?range=custom&startDate=${date}&endDate=${date}`;
      const report = async () => ok(await api(context.request, reportPath), expect).data;
      const before = await report();
      const data = {
        name: name('cost'),
        amountDzd: 1375,
        period: 'once',
        startDate: date,
        endDate: null,
      };
      const created = ok(
        await api(context.request, '/api/stats/profit-tracker/costs', { method: 'POST', data }),
        expect,
      ).data;
      let removed = false;
      try {
        const afterCreate = await report();
        ok(
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'PUT',
            data: { ...data, amountDzd: 2125 },
          }),
          expect,
        );
        const afterEdit = await report();
        ok(
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'DELETE',
          }),
          expect,
        );
        removed = true;
        const afterDelete = await report();
        save('cost-lifecycle', {
          id: created.id,
          date,
          before: before.summary,
          afterCreate: afterCreate.summary,
          afterEdit: afterEdit.summary,
          afterDelete: afterDelete.summary,
        });
        expect(afterCreate.summary.operatingCostDzd - before.summary.operatingCostDzd).toBe(1375);
        expect(afterEdit.summary.operatingCostDzd - before.summary.operatingCostDzd).toBe(2125);
        expect(afterDelete.summary.operatingCostDzd).toBe(before.summary.operatingCostDzd);
        expect(afterDelete.costs.some((item) => item.id === created.id)).toBe(false);
      } finally {
        if (!removed)
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'DELETE',
          });
      }
    },
  );
}
