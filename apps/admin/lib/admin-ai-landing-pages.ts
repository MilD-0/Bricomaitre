import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { generateLandingPageForProduct } from './ai-admin-capabilities';
import {
  createLandingPageEditor,
  type LandingPageEditInput,
  type LandingPageEditResult,
  type LandingPageGenerator,
} from './ai-landing-page';
import {
  createLandingPage,
  getLandingPageDetail,
  saveLandingPage,
  setLandingPageActive,
} from './landing-pages';
import { revalidateStorefrontLandingPages } from './storefront-revalidate';

export const adminAiLandingPageCreateSchema = z
  .object({
    productId: z.number().int().positive(),
    locale: z.enum(['fr', 'ar']),
    creativeBrief: z.string().trim().min(1).max(2_000).optional(),
    active: z.boolean().default(false),
  })
  .strict();

export const adminAiLandingPageEditSchema = z
  .object({
    landingPageId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    instruction: z.string().trim().min(1).max(4_000).nullable().default(null),
    active: z.boolean().nullable().default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.instruction == null && input.active == null)
      context.addIssue({
        code: 'custom',
        message: 'Provide a content edit instruction, a publication change, or both.',
      });
  });

type AdminAiActor = { email?: string | null; name?: string | null };

export interface AdminAiLandingPageEditor {
  edit(input: LandingPageEditInput): Promise<LandingPageEditResult>;
}

function actorId(actor?: AdminAiActor) {
  return actor?.email?.trim() || null;
}

function generationSummary(result: {
  model: string;
  reasoning: string;
  groundingNotes: string[];
  stages?: unknown;
}) {
  return {
    model: result.model,
    reasoning: result.reasoning,
    groundingNotes: result.groundingNotes,
    stages: result.stages ?? null,
  };
}

export async function createAdminAiLandingPage(
  rawInput: z.input<typeof adminAiLandingPageCreateSchema>,
  actor?: AdminAiActor,
  generator?: LandingPageGenerator,
) {
  const input = adminAiLandingPageCreateSchema.parse(rawInput);
  const generated = await generateLandingPageForProduct({
    productId: input.productId,
    locale: input.locale,
    campaignAngle: input.creativeBrief,
    generator,
  });
  const page = await createLandingPage({
    productId: input.productId,
    locale: input.locale,
    document: generated.generation.document,
    actorId: actorId(actor),
    source: 'ai',
  });
  if (input.active) {
    await setLandingPageActive({
      id: page.id,
      active: true,
      expectedRevision: 1,
      actorId: actorId(actor),
    });
    await revalidateStorefrontLandingPages();
  }
  return {
    id: page.id,
    productId: input.productId,
    locale: input.locale,
    slug: page.slug,
    active: input.active,
    currentRevision: 1,
    generation: generationSummary(generated.generation),
  };
}

async function loadLandingPageProduct(productId: number) {
  const db = getDb();
  const [product] = await db
    .select({
      id: products.id,
      title: products.title,
      titleAr: products.titleAr,
      description: products.description,
      descriptionAr: products.descriptionAr,
      brand: brands.name,
      category: categories.name,
      sku: products.sku,
      barcode: products.barcode,
      images: products.images,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new Error('Landing-page product not found.');
  return product;
}

export async function editAdminAiLandingPage(
  rawInput: z.input<typeof adminAiLandingPageEditSchema>,
  actor?: AdminAiActor,
  editor: AdminAiLandingPageEditor = createLandingPageEditor(),
) {
  const input = adminAiLandingPageEditSchema.parse(rawInput);
  const page = await getLandingPageDetail(input.landingPageId);
  const instruction = input.instruction;
  const edited = instruction
    ? await (async () => {
        const product = await loadLandingPageProduct(page.productId);
        return editor.edit({
          locale: page.locale,
          instruction,
          currentDocument: page.document,
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
        });
      })()
    : null;
  const saved = await saveLandingPage({
    id: page.id,
    document: edited?.document ?? page.document,
    active: input.active ?? page.active,
    expectedRevision: input.expectedRevision,
    actorId: actorId(actor),
    source: 'ai',
  });
  await revalidateStorefrontLandingPages();
  return {
    ...saved,
    slug: page.slug,
    productId: page.productId,
    locale: page.locale,
    generation: edited ? generationSummary(edited) : null,
  };
}
