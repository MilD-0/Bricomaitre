import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { loadAssetsData } from './admin-assets-data';
import {
  createAdminAsset,
  deleteAdminAsset,
  reorderAdminAssets,
  replaceAdminAsset,
  updateAdminAssetStates,
} from './asset-mutations';
import {
  assetBannerInputSchema,
  assetBannerSchema,
  featuredProductGroupInputSchema,
  featuredProductGroupSchema,
  productCardSchema,
  type AssetBannerPayload,
  type AssetBannerRecord,
  type FeaturedProductGroupPayload,
  type FeaturedProductGroupRecord,
  type ProductCardPayload,
  type ProductCardRecord,
} from './assets';
import type { ActionActor } from './action-history';

const assetKindSchema = z.enum(['banner', 'featured-group', 'product-card']);
const requiredImageUrlSchema = z.string().trim().url().max(2_048).describe('Absolute image URL.');

export const ADMIN_AI_INSPECT_ASSETS_TOOL_DESCRIPTION =
  'Read current banners, featured groups, or product cards, with active-state counts and exact missing IDs when requested.';

export const ADMIN_AI_MANAGE_ASSETS_TOOL_DESCRIPTION =
  'Create, update, or permanently delete one Storefront asset. Updates change only named fields and preserve everything else.';

export const ADMIN_AI_REORDER_ASSETS_TOOL_DESCRIPTION =
  'Set the complete Storefront order for one asset kind using every current ID exactly once.';

export const adminAiAssetInspectionSchema = z
  .object({
    kind: z.enum(['all', ...assetKindSchema.options]).default('all'),
    ids: z.array(z.number().int().positive()).max(50).default([]),
    active: z.boolean().nullable().default(null),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === 'all' && input.ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['kind'],
        message: 'Choose one asset kind when inspecting exact IDs.',
      });
    }
    if (new Set(input.ids).size !== input.ids.length) {
      context.addIssue({ code: 'custom', path: ['ids'], message: 'Asset IDs must be unique.' });
    }
  });

const bannerCreateSchema = assetBannerInputSchema
  .omit({ imageUrl: true, imageUrlLandscape: true, imageUrlPortrait: true })
  .extend({
    imageUrlLandscape: requiredImageUrlSchema,
    imageUrlPortrait: requiredImageUrlSchema,
  })
  .strict()
  .describe('A bilingual banner with landscape and portrait image URLs.');

const featuredGroupCreateSchema = featuredProductGroupInputSchema
  .strict()
  .describe('A bilingual featured group selecting at least one product, brand, or category.');

const productCardCreateSchema = productCardSchema
  .strict()
  .describe('A bilingual editorial card tied to one product.');

function requireChanges<T extends z.ZodType>(schema: T) {
  return schema.refine(
    (value) => Object.values(value as Record<string, unknown>).some((field) => field !== undefined),
    { message: 'Provide at least one field to change.' },
  );
}

const bannerChangesSchema = requireChanges(
  z
    .object({
      title: assetBannerInputSchema.shape.title.optional(),
      titleAr: assetBannerInputSchema.shape.titleAr.optional(),
      imageUrlPortrait: requiredImageUrlSchema.optional(),
      imageUrlLandscape: requiredImageUrlSchema.optional(),
      productId: assetBannerInputSchema.shape.productId.optional(),
      active: z.boolean().optional(),
    })
    .strict(),
);
const featuredGroupChangesSchema = requireChanges(
  z
    .object({
      name: featuredProductGroupInputSchema.shape.name.optional(),
      nameAr: featuredProductGroupInputSchema.shape.nameAr.optional(),
      cta: featuredProductGroupInputSchema.shape.cta.optional(),
      ctaAr: featuredProductGroupInputSchema.shape.ctaAr.optional(),
      link: featuredProductGroupInputSchema.shape.link.optional(),
      productIds: z.array(z.coerce.number().int().positive()).optional(),
      brandIds: z.array(z.coerce.number().int().positive()).optional(),
      categoryIds: z.array(z.coerce.number().int().positive()).optional(),
      prioritizeRecommendations: z.boolean().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
);
const productCardChangesSchema = requireChanges(
  z
    .object({
      productId: productCardSchema.shape.productId.optional(),
      titleAr: productCardSchema.shape.titleAr.optional(),
      titleFr: productCardSchema.shape.titleFr.optional(),
      descriptionAr: productCardSchema.shape.descriptionAr.optional(),
      descriptionFr: productCardSchema.shape.descriptionFr.optional(),
      characteristicsAr: productCardSchema.shape.characteristicsAr.optional(),
      characteristicsFr: productCardSchema.shape.characteristicsFr.optional(),
      active: z.boolean().optional(),
    })
    .strict(),
);

const assetCreateTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('banner'), data: bannerCreateSchema }),
  z.strictObject({ kind: z.literal('featured-group'), data: featuredGroupCreateSchema }),
  z.strictObject({ kind: z.literal('product-card'), data: productCardCreateSchema }),
]);

const assetUpdateTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('banner'),
    id: z.number().int().positive(),
    changes: bannerChangesSchema,
  }),
  z.strictObject({
    kind: z.literal('featured-group'),
    id: z.number().int().positive(),
    changes: featuredGroupChangesSchema,
  }),
  z.strictObject({
    kind: z.literal('product-card'),
    id: z.number().int().positive(),
    changes: productCardChangesSchema,
  }),
]);

export const adminAiAssetCrudSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), asset: assetCreateTargetSchema }),
  z.strictObject({ operation: z.literal('update'), asset: assetUpdateTargetSchema }),
  z.strictObject({
    operation: z.literal('delete'),
    asset: z.strictObject({ kind: assetKindSchema, id: z.number().int().positive() }),
  }),
]);

export const adminAiAssetReorderSchema = z
  .object({
    kind: assetKindSchema,
    orderedIds: z.array(z.number().int().positive()).min(1).max(200),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.orderedIds).size !== input.orderedIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['orderedIds'],
        message: 'Each asset ID must appear exactly once.',
      });
    }
  });

function recordsForKind(
  data: Awaited<ReturnType<typeof loadAssetsData>>,
  kind: z.infer<typeof assetKindSchema>,
) {
  if (kind === 'banner') return data.banners;
  if (kind === 'featured-group') return data.featuredGroups;
  return data.productCards;
}

function summarizeRecords<T extends { id: number; active: boolean }>(
  records: T[],
  input: z.output<typeof adminAiAssetInspectionSchema>,
) {
  const idSet = new Set(input.ids);
  const matched = records.filter(
    (record) =>
      (idSet.size === 0 || idSet.has(record.id)) &&
      (input.active === null || record.active === input.active),
  );
  const returned = matched.slice(0, input.limit);
  const foundIds = new Set(records.map((record) => record.id));
  return {
    counts: {
      total: records.length,
      active: records.filter((record) => record.active).length,
      inactive: records.filter((record) => !record.active).length,
      matched: matched.length,
      returned: returned.length,
    },
    items: returned,
    ...(input.ids.length > 0
      ? {
          requestedIds: input.ids,
          missingIds: input.ids.filter((id) => !foundIds.has(id)),
        }
      : {}),
  };
}

export async function inspectAdminAiAssets(rawInput: z.input<typeof adminAiAssetInspectionSchema>) {
  const input = adminAiAssetInspectionSchema.parse(rawInput);
  const data = await loadAssetsData();
  return {
    kind: 'admin_assets' as const,
    ...(input.kind === 'all' || input.kind === 'banner'
      ? { banners: summarizeRecords(data.banners, input) }
      : {}),
    ...(input.kind === 'all' || input.kind === 'featured-group'
      ? { featuredGroups: summarizeRecords(data.featuredGroups, input) }
      : {}),
    ...(input.kind === 'all' || input.kind === 'product-card'
      ? { productCards: summarizeRecords(data.productCards, input) }
      : {}),
  };
}

function bannerPayload(record: AssetBannerRecord): AssetBannerPayload {
  return {
    title: record.title,
    titleAr: record.titleAr,
    imageUrl: record.imageUrl,
    imageUrlPortrait: record.imageUrlPortrait,
    imageUrlLandscape: record.imageUrlLandscape,
    productId: record.productId,
    active: record.active,
  };
}

function featuredGroupPayload(record: FeaturedProductGroupRecord): FeaturedProductGroupPayload {
  return {
    name: record.name,
    nameAr: record.nameAr,
    cta: record.cta,
    ctaAr: record.ctaAr,
    link: record.link,
    productIds: record.productIds,
    brandIds: record.brandIds,
    categoryIds: record.categoryIds,
    prioritizeRecommendations: record.prioritizeRecommendations,
    active: record.active,
  };
}

function productCardPayload(record: ProductCardRecord): ProductCardPayload {
  return {
    productId: record.productId,
    titleAr: record.titleAr,
    titleFr: record.titleFr,
    descriptionAr: record.descriptionAr,
    descriptionFr: record.descriptionFr,
    characteristicsAr: record.characteristicsAr,
    characteristicsFr: record.characteristicsFr,
    active: record.active,
  };
}

function payloadForRecord(
  kind: z.infer<typeof assetKindSchema>,
  record: AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord,
) {
  if (kind === 'banner') return bannerPayload(record as AssetBannerRecord);
  if (kind === 'featured-group') {
    return featuredGroupPayload(record as FeaturedProductGroupRecord);
  }
  return productCardPayload(record as ProductCardRecord);
}

async function loadExactAsset(kind: z.infer<typeof assetKindSchema>, id: number) {
  const data = await loadAssetsData();
  const record = recordsForKind(data, kind).find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Asset ${kind} #${id} does not exist.`);
  return record;
}

export async function manageAdminAiAsset(
  rawInput: z.input<typeof adminAiAssetCrudSchema>,
  actor?: ActionActor,
) {
  const input = adminAiAssetCrudSchema.parse(rawInput);
  const db = getDb();
  if (input.operation === 'create') {
    const data =
      input.asset.kind === 'banner'
        ? assetBannerSchema.parse({ ...input.asset.data, imageUrl: undefined })
        : input.asset.kind === 'featured-group'
          ? featuredProductGroupSchema.parse(input.asset.data)
          : productCardSchema.parse(input.asset.data);
    const created = await createAdminAsset(db, input.asset.kind, data, actor);
    return { ok: true, operation: input.operation, ...created };
  }

  const previousRecord = await loadExactAsset(input.asset.kind, input.asset.id);
  const previous = payloadForRecord(input.asset.kind, previousRecord);
  if (input.operation === 'delete') {
    const deleted = await deleteAdminAsset(db, input.asset.kind, input.asset.id, actor);
    return { ok: true, operation: input.operation, previous, ...deleted };
  }

  const merged = { ...previous, ...input.asset.changes };
  const stateFields = Object.keys(input.asset.changes);
  const stateOnly =
    stateFields.every((field) =>
      input.asset.kind === 'featured-group'
        ? field === 'active' || field === 'prioritizeRecommendations'
        : field === 'active',
    ) && stateFields.length > 0;
  if (stateOnly) {
    await updateAdminAssetStates(
      db,
      {
        items: [
          {
            kind: input.asset.kind,
            id: input.asset.id,
            ...(input.asset.changes.active !== undefined
              ? { active: input.asset.changes.active }
              : {}),
            ...(input.asset.kind === 'featured-group' &&
            input.asset.changes.prioritizeRecommendations !== undefined
              ? {
                  prioritizeRecommendations: input.asset.changes.prioritizeRecommendations,
                }
              : {}),
          },
        ],
      },
      actor,
    );
    return {
      ok: true,
      operation: input.operation,
      kind: input.asset.kind,
      id: input.asset.id,
      previous,
      data: merged,
    };
  }

  const data =
    input.asset.kind === 'banner'
      ? assetBannerSchema.parse({
          ...merged,
          imageUrlLandscape:
            (merged as AssetBannerPayload).imageUrlLandscape ??
            (previous as AssetBannerPayload).imageUrl,
          imageUrlPortrait:
            (merged as AssetBannerPayload).imageUrlPortrait ??
            (previous as AssetBannerPayload).imageUrl,
          ...(input.asset.changes.imageUrlLandscape !== undefined
            ? { imageUrl: input.asset.changes.imageUrlLandscape }
            : {}),
        })
      : input.asset.kind === 'featured-group'
        ? featuredProductGroupSchema.parse(merged)
        : productCardSchema.parse(merged);
  const updated = await replaceAdminAsset(db, input.asset.kind, input.asset.id, data, actor);
  return { ok: true, operation: input.operation, previous, ...updated };
}

export async function reorderAdminAiAssets(rawInput: z.input<typeof adminAiAssetReorderSchema>) {
  const input = adminAiAssetReorderSchema.parse(rawInput);
  const data = await loadAssetsData();
  const current = recordsForKind(data, input.kind).map(({ id }) => id);
  const currentSet = new Set(current);
  const missingIds = current.filter((id) => !input.orderedIds.includes(id));
  const unknownIds = input.orderedIds.filter((id) => !currentSet.has(id));
  if (
    missingIds.length > 0 ||
    unknownIds.length > 0 ||
    current.length !== input.orderedIds.length
  ) {
    throw new Error(
      `Reorder must contain every current ${input.kind} ID exactly once. Missing: ${missingIds.join(', ') || 'none'}. Unknown: ${unknownIds.join(', ') || 'none'}.`,
    );
  }

  const items = input.orderedIds.map((id, sortOrder) => ({ id, sortOrder }));
  await reorderAdminAssets(getDb(), { kind: input.kind, items });
  return {
    ok: true,
    kind: input.kind,
    before: current,
    after: input.orderedIds,
  };
}
