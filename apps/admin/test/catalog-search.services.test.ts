import { randomUUID } from 'node:crypto';
import { getDb, getPool } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { readStorefrontProducts, countStorefrontProducts } from '@bric/storefront-core/catalog';
import { storefrontProductListQuerySchema } from '@bric/storefront-core/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

afterAll(() => getPool().end());

it('keeps French, Arabic, identifiers and fuzzy search current across catalog edits', async () => {
  const rollback = new Error('rollback');
  try {
    await getDb().transaction(async (tx) => {
      const db = tx as unknown as ReturnType<typeof getDb>;
      const slug = randomUUID();
      const [brand] = await tx.insert(brands).values({ name: 'Bosch', slug }).returning();
      const [category] = await tx
        .insert(categories)
        .values({ name: 'Éclairage', nameAr: 'إِضَاءَة', slug })
        .returning();
      const [product] = await tx
        .insert(products)
        .values({
          title: 'Perceuse électrique',
          titleAr: 'مِثْقَاب كهربائي',
          description: 'Pour béton et métal',
          sku: `SKU-${slug}`,
          barcode: '1234567890123',
          slug,
          price: '100',
          brandId: brand!.id,
          categoryId: category!.id,
        })
        .returning();
      const search = async (term: string) => {
        const query = storefrontProductListQuerySchema.parse({ search: term, id: product!.id });
        expect(await countStorefrontProducts(db, query)).toBe(1);
        expect((await readStorefrontProducts(db, query)).map((row) => row.id)).toEqual([
          product!.id,
        ]);
      };
      for (const term of [
        'perceuse',
        'perceuze',
        'beton',
        'Bosch',
        'eclairage',
        'مثقاب',
        'اضاءه',
        product!.sku!,
        product!.barcode!,
      ])
        await search(term);
      await tx
        .update(products)
        .set({ title: 'Scie circulaire', titleAr: null, description: null })
        .where(eq(products.id, product!.id));
      await tx.update(brands).set({ name: 'Makita' }).where(eq(brands.id, brand!.id));
      await tx
        .update(categories)
        .set({ name: 'Découpe', nameAr: null })
        .where(eq(categories.id, category!.id));
      for (const term of ['scie', 'Makita', 'decoupe']) await search(term);
      expect(
        await countStorefrontProducts(
          db,
          storefrontProductListQuerySchema.parse({ search: 'Bosch', id: product!.id }),
        ),
      ).toBe(0);
      await tx.update(brands).set({ isActive: false }).where(eq(brands.id, brand!.id));
      expect(
        await countStorefrontProducts(
          db,
          storefrontProductListQuerySchema.parse({ search: 'Makita', id: product!.id }),
        ),
      ).toBe(0);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
