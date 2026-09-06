import { expect, test } from '@playwright/test';

for (const locale of ['en', 'fr', 'ar']) {
  test(`edits both pinned and recent posts in ${locale}`, async ({ page }, testInfo) => {
    const posts = [true, false].map((pinned, index) => ({
      id: index + 1,
      title: pinned ? 'Dispatch reminder' : 'Stock arrival',
      body: pinned ? 'Call before dispatch.' : 'New tools arrive on Monday.',
      pinned,
      tags: ['ops'],
      attachments: [],
      reactions: [],
      replies: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      author: { id: 'operator', name: 'Nadia', email: 'nadia@example.invalid' },
      permissions: { canEdit: true, canDelete: true, canPin: true },
    }));
    const edits: unknown[] = [];
    await page.route('**/api/bulletin**', async (route) => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        const edit = request.postDataJSON();
        edits.push(edit);
        const id = Number(new URL(request.url()).pathname.split('/').at(-1));
        Object.assign(
          posts.find((post) => post.id === id)!,
          edit,
        );
        await route.fulfill({ json: { ok: true } });
        return;
      }
      await route.fulfill({
        json: {
          posts,
          currentUserId: 'operator',
          availableTags: ['ops'],
          permissions: { canModerate: true, canPost: true },
          pagination: {
            page: 1,
            limit: 20,
            totalItems: 2,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      });
    });
    await page.goto(`/${locale}/bulletin`);
    await expect(page.locator('[data-bulletin-post]')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await testInfo.attach(`bulletin-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    const labels = {
      en: { edit: 'Edit', save: 'Save changes' },
      fr: { edit: 'Modifier', save: 'Enregistrer' },
      ar: { edit: 'تعديل', save: 'حفظ التغييرات' },
    }[locale]!;
    for (const id of [1, 2]) {
      const post = page.locator(`[data-bulletin-post="${id}"]`);
      await post.getByRole('button', { name: / · / }).click();
      await page.getByRole('menuitem', { name: labels.edit, exact: true }).click();
      const dialog = page.locator('form').filter({ has: page.locator('#bulletin-title') });
      const title = dialog.locator('input[name="title"]');
      await expect(title).toHaveValue(posts[id - 1]!.title);
      await title.fill(`Updated post ${id}`);
      await dialog.getByRole('button', { name: labels.save, exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(post.getByRole('heading')).toHaveText(`Updated post ${id}`);
    }
    expect(edits).toHaveLength(2);
  });
}
