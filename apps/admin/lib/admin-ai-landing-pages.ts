import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { generateLandingPageForProduct } from './ai-landing-page-product';
import {
  createLandingPageEditor,
  type LandingPageEditInput,
  type LandingPageEditResult,
  type LandingPageGenerator,
} from './ai-landing-page';
import {
  createLandingPage,
  getLandingPageDetail,
  queryLandingPageSummaries,
  saveLandingPage,
  setLandingPageActive,
} from './landing-pages';
import { revalidateStorefrontLandingPages } from './storefront-revalidate';

export const ADMIN_AI_INSPECT_LANDING_PAGES_TOOL_DESCRIPTION = [
  'Find landing pages and inspect only the detail needed.',
  'summary lists records, outline returns block identity and structure, and content returns one exact page document or selected block IDs.',
].join(' ');

export const adminAiLandingPageInspectionSchema = z
  .object({
    landingPageIds: z.array(z.number().int().positive()).max(20).default([]),
    productIds: z.array(z.number().int().positive()).max(20).default([]),
    query: z.string().trim().max(200).default(''),
    locale: z.enum(['fr', 'ar']).nullable().default(null),
    active: z.boolean().nullable().default(null),
    view: z.enum(['summary', 'outline', 'content']).default('summary'),
    blockIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.view === 'content' && input.landingPageIds.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['landingPageIds'],
        message: 'Content inspection requires one exact landing-page ID.',
      });
    }
    if (input.blockIds.length > 0 && input.view !== 'content') {
      context.addIssue({
        code: 'custom',
        path: ['blockIds'],
        message: 'Block selection is available only for content inspection.',
      });
    }
  });

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
    instruction: z.string().trim().min(1).max(4_000),
    targetBlockIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    deleteBlockIds: z.array(z.string().trim().min(1).max(80)).max(18).default([]),
    allowStructuralChanges: z.boolean().default(false),
    active: z.boolean().nullable().default(null),
  })
  .strict();

export const adminAiLandingPagePublicationSchema = z
  .object({
    landingPageId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    active: z.boolean(),
  })
  .strict();

type AdminAiActor = { email?: string | null; name?: string | null };

export interface AdminAiLandingPageEditor {
  edit(input: LandingPageEditInput): Promise<LandingPageEditResult>;
}

type LandingPageInspectionDependencies = {
  listSummaries: typeof queryLandingPageSummaries;
  getDetail: typeof getLandingPageDetail;
};

const inspectionDependencies: LandingPageInspectionDependencies = {
  listSummaries: queryLandingPageSummaries,
  getDetail: getLandingPageDetail,
};

function actorId(actor?: AdminAiActor) {
  return actor?.email?.trim() || null;
}

function blockOutline(
  block: Awaited<ReturnType<typeof getLandingPageDetail>>['document']['blocks'][number],
) {
  return {
    id: block.id,
    type: block.type,
    surface: block.surface,
    width: block.width,
    heading: 'heading' in block ? block.heading : null,
  };
}

export async function inspectAdminAiLandingPages(
  rawInput: z.input<typeof adminAiLandingPageInspectionSchema>,
  dependencies: LandingPageInspectionDependencies = inspectionDependencies,
) {
  const input = adminAiLandingPageInspectionSchema.parse(rawInput);
  const requestedIds = [...new Set(input.landingPageIds)];
  const result = await dependencies.listSummaries({ ...input, landingPageIds: requestedIds });
  const selected = result.items;
  const base = {
    kind: 'admin_landing_pages' as const,
    view: input.view,
    filters: {
      landingPageIds: requestedIds,
      productIds: [...new Set(input.productIds)],
      query: input.query,
      locale: input.locale,
      active: input.active,
    },
    requestedIds,
    missingIds: result.missingIds,
    pagination: result.pagination,
  };

  if (input.view === 'summary') return { ...base, items: selected };

  const details = await Promise.all(selected.map((page) => dependencies.getDetail(page.id)));
  if (input.view === 'outline') {
    return {
      ...base,
      items: details.map(({ document, ...page }) => ({
        ...page,
        theme: document.theme,
        seo: document.seo,
        blocks: document.blocks.map(blockOutline),
      })),
    };
  }

  const detail = details[0];
  if (!detail) return { ...base, items: [] };
  const selectedBlockIds = new Set(input.blockIds);
  const blocks =
    selectedBlockIds.size === 0
      ? detail.document.blocks
      : detail.document.blocks.filter((block) => selectedBlockIds.has(block.id));
  return {
    ...base,
    items: [
      {
        ...detail,
        document: { ...detail.document, blocks },
        availableBlockIds: detail.document.blocks.map((block) => block.id),
        missingBlockIds: input.blockIds.filter(
          (id) => !detail.document.blocks.some((block) => block.id === id),
        ),
      },
    ],
  };
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
    ok: true as const,
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
  const product = await loadLandingPageProduct(page.productId);
  const edited = await editor.edit({
    locale: page.locale,
    instruction: input.instruction,
    targetBlockIds: input.targetBlockIds,
    deleteBlockIds: input.deleteBlockIds,
    allowStructuralChanges: input.allowStructuralChanges,
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
  const saved = await saveLandingPage({
    id: page.id,
    document: edited.document,
    active: input.active ?? page.active,
    expectedRevision: input.expectedRevision,
    actorId: actorId(actor),
    source: 'ai',
  });
  await revalidateStorefrontLandingPages();
  return {
    ok: true as const,
    ...saved,
    slug: page.slug,
    productId: page.productId,
    locale: page.locale,
    generation: generationSummary(edited),
  };
}

export async function setAdminAiLandingPagePublication(
  rawInput: z.input<typeof adminAiLandingPagePublicationSchema>,
  actor?: AdminAiActor,
) {
  const input = adminAiLandingPagePublicationSchema.parse(rawInput);
  const page = await getLandingPageDetail(input.landingPageId);
  const result = await setLandingPageActive({
    id: page.id,
    active: input.active,
    expectedRevision: input.expectedRevision,
    actorId: actorId(actor),
  });
  await revalidateStorefrontLandingPages();
  return {
    ok: true as const,
    id: page.id,
    slug: page.slug,
    locale: page.locale,
    currentRevision: result.currentRevision,
    before: { active: page.active },
    after: { active: result.active },
    changed: page.active !== result.active,
  };
}
