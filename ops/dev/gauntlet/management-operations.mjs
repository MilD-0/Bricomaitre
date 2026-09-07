import { randomUUID } from 'node:crypto';
export async function runManagementOperations({
  ctx,
  createProduct,
  ok,
  api,
  name,
  publicProduct,
}) {
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
}
