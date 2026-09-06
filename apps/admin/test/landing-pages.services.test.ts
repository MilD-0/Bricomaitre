import { getDb, getPool } from '@bric/db/client';
import { landingPageRevisions, landingPages, products } from '@bric/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  buildDefaultLandingPageDocument,
  createLandingPage,
  listLandingPages,
  saveLandingPage,
  setLandingPageActive,
  LandingPageConflictError,
} from '../lib/landing-pages';

afterAll(async () => {
  await getPool().end();
});

it('loads current documents across published and inactive campaigns and preserves revision conflicts', async () => {
  const db = getDb();
  const marker = randomUUID();
  const [product] = await db
    .insert(products)
    .values({ title: 'Campaign product', slug: marker, price: '100' })
    .returning();
  try {
    const fr = await createLandingPage({ productId: product!.id, locale: 'fr' });
    const ar = await createLandingPage({ productId: product!.id, locale: 'ar' });
    const document = buildDefaultLandingPageDocument({ locale: 'fr', title: 'Changed draft' });
    await saveLandingPage({ id: fr.id, document, active: true, expectedRevision: 1 });
    await setLandingPageActive({ id: fr.id, active: false, expectedRevision: 2 });
    await expect(
      saveLandingPage({ id: fr.id, document, active: true, expectedRevision: 1 }),
    ).rejects.toBeInstanceOf(LandingPageConflictError);
    await db
      .update(landingPages)
      .set({ updatedAt: new Date('2026-01-01') })
      .where(eq(landingPages.id, ar.id));
    const rows = (await listLandingPages()).filter((row) => row.productId === product!.id);
    expect(rows.map((row) => row.id)).toEqual([fr.id, ar.id]);
    expect(rows[0]).toMatchObject({
      status: 'draft',
      draftRevision: 2,
      publishedRevision: 2,
      document: { seo: { title: 'Changed draft', indexable: false } },
    });
    expect(rows[1]).toMatchObject({ locale: 'ar', draftRevision: 1, publishedRevision: null });
    expect(rows[1]!.document.blocks[0]).toMatchObject({ primaryCtaLabel: 'اطلب الآن' });
    await db.delete(landingPageRevisions).where(eq(landingPageRevisions.landingPageId, ar.id));
    await expect(listLandingPages()).rejects.toThrow();
  } finally {
    await db.delete(landingPages).where(eq(landingPages.productId, product!.id));
    await db.delete(products).where(eq(products.id, product!.id));
  }
});
