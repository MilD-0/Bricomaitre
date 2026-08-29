import { getAiConfig } from '@bric/ai-core';
import { and, eq } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import {
  createLandingPageGenerator,
  generateLandingPageDraft,
  type LandingPageGenerator,
} from './ai-landing-page';
import { landingPageSlugFromProduct } from './landing-pages';

export async function generateLandingPageForProduct(input: {
  productId: number;
  locale: 'fr' | 'ar';
  campaignAngle?: string;
  generator?: LandingPageGenerator;
}) {
  const [product] = await getDb()
    .select({
      id: products.id,
      title: products.title,
      titleAr: products.titleAr,
      description: products.description,
      descriptionAr: products.descriptionAr,
      images: products.images,
      slug: products.slug,
      sku: products.sku,
      barcode: products.barcode,
      brand: brands.name,
      category: categories.name,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, input.productId), eq(products.active, true)))
    .limit(1);
  if (!product) throw new Error('Active landing-page product not found.');

  const generation = await generateLandingPageDraft({
    generator: input.generator ?? createLandingPageGenerator(getAiConfig()),
    generationInput: {
      locale: input.locale,
      campaignAngle: input.campaignAngle?.trim() || undefined,
      product: {
        id: product.id,
        title: product.title,
        titleAr: product.titleAr,
        description: product.description?.slice(0, 12_000) ?? null,
        descriptionAr: product.descriptionAr?.slice(0, 12_000) ?? null,
        brand: product.brand,
        category: product.category,
        sku: product.sku,
        barcode: product.barcode,
        images: product.images.filter((image): image is string => Boolean(image)).slice(0, 12),
      },
    },
  });

  return { product, slug: landingPageSlugFromProduct(product), generation };
}
