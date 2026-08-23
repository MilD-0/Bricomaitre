import { evaluateDiscountPrice, getAiConfig, minimumSellingPriceForMargin } from '@bric/ai-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  aiPricingPolicies,
  aiProposals,
  aiRuns,
  brands,
  categories,
  featuredProductGroupProducts,
  featuredProductGroups,
  landingPageRevisions,
  landingPages,
  products,
} from '@bric/db/schema';
import { buildDefaultLandingPageDocument, landingPageSlugFromProduct } from './landing-pages';
import {
  createLandingPageGenerator,
  generateLandingPageDraft,
  LANDING_PAGE_PROMPT_VERSION,
  type LandingPageGenerator,
} from './ai-landing-page';
import { resolveBrandSlug, resolveCategorySlug } from './brands-categories-api';
import { AiProposalReviewConflictError } from './ai-proposal-review';
import { persistedProposalValuesMatch } from './ai-proposal-verification';
import { assertCategoryParentAllowed } from './category-hierarchy';

export const AI_CATALOG_EDIT_FIELDS = {
  products: z
    .object({
      title: z.string().trim().min(1).max(240).optional(),
      titleAr: z.string().trim().max(240).nullable().optional(),
      description: z.string().trim().max(20_000).nullable().optional(),
      descriptionAr: z.string().trim().max(20_000).nullable().optional(),
      active: z.boolean().optional(),
      inStock: z.boolean().optional(),
      brandId: z.number().int().positive().nullable().optional(),
      categoryId: z.number().int().positive().nullable().optional(),
    })
    .strict(),
  brands: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      image: z.url().nullable().optional(),
      isActive: z.boolean().optional(),
      featured: z.boolean().optional(),
    })
    .strict(),
  categories: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      nameEn: z.string().trim().max(120).nullable().optional(),
      nameAr: z.string().trim().max(120).nullable().optional(),
      image: z.url().nullable().optional(),
      isActive: z.boolean().optional(),
      featured: z.boolean().optional(),
      parentId: z.number().int().positive().nullable().optional(),
    })
    .strict(),
};
export const AI_TAXONOMY_CREATE_FIELDS = {
  brands: z
    .object({
      name: z.string().trim().min(1).max(120),
      image: z.url().nullable().optional(),
      featured: z.boolean().optional().default(false),
    })
    .strict(),
  categories: z
    .object({
      name: z.string().trim().min(1).max(120),
      nameEn: z.string().trim().max(120).nullable().optional(),
      nameAr: z.string().trim().max(120).nullable().optional(),
      image: z.url().nullable().optional(),
      featured: z.boolean().optional().default(false),
      parentId: z.number().int().positive().nullable().optional(),
    })
    .strict(),
};
export type EditableEntity = keyof typeof AI_CATALOG_EDIT_FIELDS;
export type CreatableTaxonomyEntity = keyof typeof AI_TAXONOMY_CREATE_FIELDS;
export class AiAdminCapabilityError extends AiProposalReviewConflictError {}

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const entityDependencySchema = z
  .object({ id: z.number().int().positive(), updatedAt: z.string().datetime() })
  .strict();
const proposalDependenciesSchema = z
  .object({
    brand: entityDependencySchema.optional(),
    category: entityDependencySchema.optional(),
    pricingPolicy: z
      .object({ id: z.number().int().positive(), updatedAt: z.string().datetime().nullable() })
      .strict()
      .optional(),
    featuredProducts: z.array(entityDependencySchema).min(1).optional(),
  })
  .strict();

function versionSnapshot(row: { id: number; updatedAt: Date }) {
  return { id: row.id, updatedAt: row.updatedAt.toISOString() };
}

function proposalDependencies(payload: Record<string, unknown>) {
  const parsed = proposalDependenciesSchema.safeParse(payload.dependencies ?? {});
  if (!parsed.success) {
    throw new AiAdminCapabilityError(
      'The proposal dependency snapshot is invalid. Generate a new proposal.',
      'proposal_dependency_changed',
    );
  }
  return parsed.data;
}

function requireDependencyVersion(
  current: { id: number; updatedAt: Date } | undefined,
  expected: { id: number; updatedAt: string },
  label: string,
) {
  if (!current || current.updatedAt.getTime() !== new Date(expected.updatedAt).getTime()) {
    throw new AiAdminCapabilityError(
      `The ${label} changed after this proposal was generated. Generate a new proposal.`,
      'proposal_dependency_changed',
    );
  }
}

async function assertProposalDependencies(
  tx: Transaction,
  dependencies: z.infer<typeof proposalDependenciesSchema>,
) {
  if (dependencies.brand) {
    const [current] = await tx
      .select({ id: brands.id, updatedAt: brands.updatedAt })
      .from(brands)
      .where(eq(brands.id, dependencies.brand.id))
      .for('update');
    requireDependencyVersion(current, dependencies.brand, 'assigned brand');
  }
  if (dependencies.category) {
    const [current] = await tx
      .select({ id: categories.id, updatedAt: categories.updatedAt })
      .from(categories)
      .where(eq(categories.id, dependencies.category.id))
      .for('update');
    requireDependencyVersion(current, dependencies.category, 'assigned category');
  }
  if (dependencies.pricingPolicy) {
    const [current] = await tx
      .select({ id: aiPricingPolicies.id, updatedAt: aiPricingPolicies.updatedAt })
      .from(aiPricingPolicies)
      .where(eq(aiPricingPolicies.id, dependencies.pricingPolicy.id))
      .for('update');
    const expectedUpdatedAt = dependencies.pricingPolicy.updatedAt;
    if (
      (expectedUpdatedAt === null && current) ||
      (expectedUpdatedAt !== null &&
        (!current || current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()))
    ) {
      throw new AiAdminCapabilityError(
        'The pricing policy changed after this discount was proposed. Generate a new proposal.',
        'proposal_dependency_changed',
      );
    }
  }
  if (dependencies.featuredProducts) {
    const expected = new Map(dependencies.featuredProducts.map((item) => [item.id, item]));
    const current = await tx
      .select({
        id: products.id,
        active: products.active,
        inStock: products.inStock,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(inArray(products.id, [...expected.keys()]))
      .for('update');
    for (const [id, snapshot] of expected) {
      const product = current.find((item) => item.id === id);
      requireDependencyVersion(product, snapshot, `featured product #${id}`);
      if (!product?.active || !product.inStock) {
        throw new AiAdminCapabilityError(
          `Featured product #${id} is no longer active and in stock. Generate a new proposal.`,
          'proposal_dependency_changed',
        );
      }
    }
  }
}

function requirePersistedProposalValues(
  persisted: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
) {
  if (!persistedProposalValuesMatch(persisted, expected)) {
    throw new AiAdminCapabilityError(
      'The approved change could not be verified in the database. Nothing was marked as applied.',
      'proposal_verification_failed',
    );
  }
}

export function buildTaxonomyCreateValues(input: {
  entityType: CreatableTaxonomyEntity;
  values: unknown;
  slug: string;
  actorId?: string | null;
  actorName?: string | null;
}) {
  const values =
    input.entityType === 'brands'
      ? AI_TAXONOMY_CREATE_FIELDS.brands.parse(input.values)
      : AI_TAXONOMY_CREATE_FIELDS.categories.parse(input.values);
  return {
    ...values,
    slug: input.slug,
    isActive: false as const,
    createdBy: input.actorId ?? null,
    createdByName: input.actorName ?? null,
    updatedBy: input.actorId ?? null,
    updatedByName: input.actorName ?? null,
  };
}

async function createProposal(input: {
  task: string;
  type: string;
  entityType: string;
  entityId: number;
  sourceUpdatedAt?: Date | null;
  payload: unknown;
  reasoning: string;
  actorId?: string | null;
  model?: string;
  promptVersion?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}) {
  const db = getDb();
  const [run] = await db
    .insert(aiRuns)
    .values({
      surface: 'admin',
      task: input.task,
      status: 'completed',
      model: input.model ?? 'deterministic-v1',
      promptVersion: input.promptVersion ?? `${input.task}-v1`,
      actorId: input.actorId ?? null,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
      totalTokens: input.usage?.totalTokens,
      completedAt: new Date(),
    })
    .returning({ id: aiRuns.id });
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  const [proposal] = await db
    .insert(aiProposals)
    .values({
      runId: run.id,
      proposalType: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceUpdatedAt: input.sourceUpdatedAt ?? null,
      payload: input.payload,
      reasoning: input.reasoning,
      requestedBy: input.actorId ?? null,
      expiresAt,
    })
    .returning({ id: aiProposals.id });
  return {
    id: proposal.id,
    type: input.type,
    status: 'proposed' as const,
    reasoning: input.reasoning,
    expiresAt: expiresAt.toISOString(),
    payload: input.payload,
  };
}

export async function proposeDiscount(input: {
  productId: number;
  percentOff: number;
  minimumMargin?: number;
  actorId?: string | null;
}) {
  const db = getDb();
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.active, true)))
    .limit(1);
  if (!product) throw new AiAdminCapabilityError('Active product not found.');
  if (product.purchasePrice == null)
    throw new AiAdminCapabilityError('Purchase price is required for a margin-safe discount.');
  const [policy] = await db
    .select()
    .from(aiPricingPolicies)
    .where(eq(aiPricingPolicies.id, 1))
    .limit(1);
  const defaultMargin = Number(policy?.defaultMinimumGrossMargin ?? 0.15);
  const margin = input.minimumMargin ?? defaultMargin;
  if (input.minimumMargin != null && policy?.allowRequestOverride === false)
    throw new AiAdminCapabilityError('Margin overrides are disabled.');
  const requestedPrice = Number(product.price) * (1 - input.percentOff / 100);
  const evaluation = evaluateDiscountPrice({
    purchaseCost: Number(product.purchasePrice),
    proposedPrice: requestedPrice,
    minimumGrossMargin: margin,
  });
  const suggestedPrice = Math.max(
    requestedPrice,
    minimumSellingPriceForMargin({
      purchaseCost: Number(product.purchasePrice),
      minimumGrossMargin: margin,
    }),
  );
  if (suggestedPrice >= Number(product.price))
    throw new AiAdminCapabilityError(
      'No margin-safe discount is available at the requested margin.',
    );
  return createProposal({
    task: 'discount_suggestion',
    type: 'product_discount',
    entityType: 'products',
    entityId: product.id,
    sourceUpdatedAt: product.updatedAt,
    actorId: input.actorId,
    reasoning: `Requested ${input.percentOff}% discount; adjusted to preserve ${(margin * 100).toFixed(1)}% minimum gross margin.`,
    payload: {
      before: { price: product.price, oldPrice: product.oldPrice },
      changes: { price: suggestedPrice.toFixed(2), oldPrice: product.price },
      requestedPercentOff: input.percentOff,
      minimumGrossMargin: margin,
      defaultMinimumGrossMargin: defaultMargin,
      belowDefaultMargin: margin < defaultMargin,
      evaluation,
      dependencies: {
        pricingPolicy: {
          id: 1,
          updatedAt: policy?.updatedAt.toISOString() ?? null,
        },
      },
    },
  });
}

export async function proposeFeaturedProducts(input: {
  name: string;
  limit?: number;
  actorId?: string | null;
}) {
  const db = getDb();
  const limit = input.limit ?? 8;
  const ranked = await db
    .select({
      id: products.id,
      title: products.title,
      popularityScore: products.popularityScore,
      conversionRate: products.conversionRate,
      unitsSold: products.unitsSold,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.active, true), eq(products.inStock, true)))
    .orderBy(
      desc(products.popularityScore),
      desc(products.conversionRate),
      desc(products.unitsSold),
    )
    .limit(limit);
  if (!ranked.length)
    throw new AiAdminCapabilityError('No active in-stock products are available.');
  return createProposal({
    task: 'featured_product_suggestion',
    type: 'featured_products',
    entityType: 'featured_product_groups',
    entityId: 0,
    actorId: input.actorId,
    reasoning: 'Ranked active, in-stock products by popularity, conversion rate, and units sold.',
    payload: {
      name: input.name,
      productIds: ranked.map((row) => row.id),
      evidence: ranked,
      dependencies: { featuredProducts: ranked.map(versionSnapshot) },
    },
  });
}

export async function generateLandingPageForProduct(input: {
  productId: number;
  locale: 'fr' | 'ar';
  campaignAngle?: string;
  generator?: LandingPageGenerator;
}) {
  const db = getDb();
  const [product] = await db
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
  if (!product) throw new AiAdminCapabilityError('Active product not found.');
  const baseTitle = input.locale === 'ar' && product.titleAr ? product.titleAr : product.title;
  const fallbackDocument = buildDefaultLandingPageDocument({
    locale: input.locale,
    title: baseTitle,
    description: input.locale === 'ar' ? product.descriptionAr : product.description,
    imageUrl: product.images[0] ?? null,
  });
  const config = getAiConfig();
  const generation = await generateLandingPageDraft({
    generator: input.generator ?? createLandingPageGenerator(config),
    fallbackDocument,
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
  return {
    product,
    slug: landingPageSlugFromProduct(product),
    generation,
  };
}

export async function proposeLandingPage(input: {
  productId: number;
  locale: 'fr' | 'ar';
  campaignAngle?: string;
  actorId?: string | null;
  generator?: LandingPageGenerator;
}) {
  const { product, slug, generation } = await generateLandingPageForProduct(input);
  return createProposal({
    task: 'landing_page_generation',
    type: 'landing_page',
    entityType: 'products',
    entityId: product.id,
    sourceUpdatedAt: product.updatedAt,
    actorId: input.actorId,
    reasoning: generation.reasoning,
    model: generation.model,
    promptVersion: LANDING_PAGE_PROMPT_VERSION,
    usage: generation.usage,
    payload: {
      productId: product.id,
      locale: input.locale,
      slug,
      document: generation.document,
      generation: {
        model: generation.model,
        promptVersion: LANDING_PAGE_PROMPT_VERSION,
        groundingNotes: generation.groundingNotes,
        stages: generation.stages,
      },
    },
  });
}

export async function proposeEntityEdit(input: {
  entityType: EditableEntity;
  entityId: number;
  changes: unknown;
  actorId?: string | null;
  reasoning?: string;
  model?: string;
  promptVersion?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}) {
  const changes =
    input.entityType === 'products'
      ? AI_CATALOG_EDIT_FIELDS.products.parse(input.changes)
      : input.entityType === 'brands'
        ? AI_CATALOG_EDIT_FIELDS.brands.parse(input.changes)
        : AI_CATALOG_EDIT_FIELDS.categories.parse(input.changes);
  if (!Object.keys(changes).length)
    throw new AiAdminCapabilityError('At least one supported field must change.');
  const db = getDb();
  const table =
    input.entityType === 'products'
      ? products
      : input.entityType === 'brands'
        ? brands
        : categories;
  const [entity] = await db
    .select()
    .from(table as typeof products)
    .where(eq((table as typeof products).id, input.entityId))
    .limit(1);
  if (!entity) throw new AiAdminCapabilityError('Entity not found.');
  if (input.entityType === 'categories') {
    const parentId = AI_CATALOG_EDIT_FIELDS.categories.parse(changes).parentId;
    if (parentId !== undefined) {
      await assertCategoryParentAllowed(db, input.entityId, parentId ?? null);
    }
  }
  if (persistedProposalValuesMatch(entity as Record<string, unknown>, changes))
    throw new AiAdminCapabilityError('The requested edit does not change the current entity.');
  const dependencies: Record<string, ReturnType<typeof versionSnapshot>> = {};
  if (input.entityType === 'products') {
    const productChanges = AI_CATALOG_EDIT_FIELDS.products.parse(changes);
    if (productChanges.brandId != null) {
      const [brand] = await db
        .select({ id: brands.id, updatedAt: brands.updatedAt })
        .from(brands)
        .where(eq(brands.id, productChanges.brandId))
        .limit(1);
      if (!brand) throw new AiAdminCapabilityError('Assigned brand not found.');
      dependencies.brand = versionSnapshot(brand);
    }
    if (productChanges.categoryId != null) {
      const [category] = await db
        .select({ id: categories.id, updatedAt: categories.updatedAt })
        .from(categories)
        .where(eq(categories.id, productChanges.categoryId))
        .limit(1);
      if (!category) throw new AiAdminCapabilityError('Assigned category not found.');
      dependencies.category = versionSnapshot(category);
    }
  }
  return createProposal({
    task:
      input.entityType === 'products' && 'categoryId' in changes
        ? 'product_categorization'
        : 'catalog_entity_edit',
    type: 'entity_edit',
    entityType: input.entityType,
    entityId: input.entityId,
    sourceUpdatedAt: entity.updatedAt,
    actorId: input.actorId,
    reasoning:
      input.reasoning ?? `Reviewable ${input.entityType} field edit requested through admin chat.`,
    model: input.model,
    promptVersion: input.promptVersion,
    usage: input.usage,
    payload: {
      before: Object.fromEntries(
        Object.keys(changes).map((key) => [key, (entity as Record<string, unknown>)[key]]),
      ),
      changes,
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    },
  });
}

export async function proposeTaxonomyCreate(input: {
  entityType: CreatableTaxonomyEntity;
  values: unknown;
  actorId?: string | null;
}) {
  const values =
    input.entityType === 'brands'
      ? AI_TAXONOMY_CREATE_FIELDS.brands.parse(input.values)
      : AI_TAXONOMY_CREATE_FIELDS.categories.parse(input.values);
  const db = getDb();
  const parentId =
    input.entityType === 'categories'
      ? AI_TAXONOMY_CREATE_FIELDS.categories.parse(values).parentId
      : null;
  if (parentId != null) {
    await assertCategoryParentAllowed(db, null, parentId);
  }
  return createProposal({
    task: 'catalog_taxonomy_create',
    type: 'entity_create',
    entityType: input.entityType,
    entityId: 0,
    actorId: input.actorId,
    reasoning: `Reviewable inactive ${input.entityType === 'brands' ? 'brand' : 'category'} creation requested through admin chat.`,
    payload: { values },
  });
}

export async function reviewAdminProposal(input: {
  proposalId: number;
  action: 'approve' | 'reject';
  actorId?: string | null;
  actorName?: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed')))
      .limit(1)
      .for('update');
    if (!proposal)
      throw new AiAdminCapabilityError(
        'Proposal is unavailable or already reviewed.',
        'proposal_already_reviewed',
      );
    if (input.action === 'reject') {
      const [rejected] = await tx
        .update(aiProposals)
        .set({
          status: 'rejected',
          reviewedBy: input.actorId ?? null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
        .returning({ id: aiProposals.id });
      if (!rejected) {
        throw new AiAdminCapabilityError(
          'The proposal changed while it was being reviewed.',
          'proposal_already_reviewed',
        );
      }
      return {
        id: proposal.id,
        status: 'rejected' as const,
        verified: true as const,
        proposalType: proposal.proposalType,
      };
    }
    if (proposal.expiresAt <= new Date())
      throw new AiAdminCapabilityError(
        'Proposal expired. Generate a new proposal.',
        'proposal_expired',
      );
    const payload = proposal.payload as Record<string, unknown>;
    const dependencies = proposalDependencies(payload);
    if (proposal.sourceUpdatedAt) {
      const table =
        proposal.entityType === 'products'
          ? products
          : proposal.entityType === 'brands'
            ? brands
            : proposal.entityType === 'categories'
              ? categories
              : null;
      if (table) {
        const [current] = await tx
          .select({ updatedAt: table.updatedAt })
          .from(table)
          .where(eq(table.id, proposal.entityId))
          .limit(1)
          .for('update');
        if (!current || current.updatedAt.getTime() !== proposal.sourceUpdatedAt.getTime())
          throw new AiAdminCapabilityError(
            'The source record changed after this proposal was generated. Generate it again.',
            'proposal_stale',
          );
      }
    }
    await assertProposalDependencies(tx, dependencies);
    if (proposal.proposalType === 'product_discount') {
      const changes = z
        .object({ price: z.string(), oldPrice: z.string().nullable() })
        .strict()
        .parse(payload.changes);
      const [persisted] = await tx
        .update(products)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(products.id, proposal.entityId))
        .returning();
      requirePersistedProposalValues(persisted, changes);
    } else if (proposal.proposalType === 'entity_edit') {
      if (proposal.entityType === 'products') {
        const changes = AI_CATALOG_EDIT_FIELDS.products.parse(payload.changes);
        const [persisted] = await tx
          .update(products)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(products.id, proposal.entityId))
          .returning();
        requirePersistedProposalValues(persisted, changes);
      } else if (proposal.entityType === 'brands') {
        const changes = AI_CATALOG_EDIT_FIELDS.brands.parse(payload.changes);
        const slug =
          changes.name === undefined
            ? undefined
            : await resolveBrandSlug(changes.name, proposal.entityId, tx);
        const [persisted] = await tx
          .update(brands)
          .set({
            ...changes,
            slug,
            updatedBy: input.actorId ?? null,
            updatedByName: input.actorName ?? null,
            updatedAt: new Date(),
          })
          .where(eq(brands.id, proposal.entityId))
          .returning();
        requirePersistedProposalValues(persisted, {
          ...changes,
          ...(slug === undefined ? {} : { slug }),
        });
      } else if (proposal.entityType === 'categories') {
        const changes = AI_CATALOG_EDIT_FIELDS.categories.parse(payload.changes);
        if (changes.parentId !== undefined) {
          await assertCategoryParentAllowed(tx, proposal.entityId, changes.parentId ?? null, {
            lockHierarchy: true,
          });
        }
        const slug =
          changes.name === undefined
            ? undefined
            : await resolveCategorySlug(changes.name, proposal.entityId, tx);
        const [persisted] = await tx
          .update(categories)
          .set({
            ...changes,
            slug,
            updatedBy: input.actorId ?? null,
            updatedByName: input.actorName ?? null,
            updatedAt: new Date(),
          })
          .where(eq(categories.id, proposal.entityId))
          .returning();
        requirePersistedProposalValues(persisted, {
          ...changes,
          ...(slug === undefined ? {} : { slug }),
        });
      }
    } else if (proposal.proposalType === 'entity_create') {
      if (proposal.entityType === 'brands') {
        const values = AI_TAXONOMY_CREATE_FIELDS.brands.parse(payload.values);
        const slug = await resolveBrandSlug(values.name, undefined, tx);
        const expected = buildTaxonomyCreateValues({
          entityType: 'brands',
          values,
          slug,
          actorId: input.actorId,
          actorName: input.actorName,
        });
        const [persisted] = await tx.insert(brands).values(expected).returning();
        requirePersistedProposalValues(persisted, expected);
      } else if (proposal.entityType === 'categories') {
        const values = AI_TAXONOMY_CREATE_FIELDS.categories.parse(payload.values);
        await assertCategoryParentAllowed(tx, null, values.parentId ?? null, {
          lockHierarchy: true,
        });
        const slug = await resolveCategorySlug(values.name, undefined, tx);
        const expected = buildTaxonomyCreateValues({
          entityType: 'categories',
          values,
          slug,
          actorId: input.actorId,
          actorName: input.actorName,
        });
        const [persisted] = await tx.insert(categories).values(expected).returning();
        requirePersistedProposalValues(persisted, expected);
      } else throw new AiAdminCapabilityError('Unsupported taxonomy entity type.');
    } else if (proposal.proposalType === 'featured_products') {
      const expectedGroup = { name: String(payload.name), active: false };
      const productIds = z.array(z.number().int().positive()).min(1).parse(payload.productIds);
      if (!dependencies.featuredProducts) {
        const currentProducts = await tx
          .select({ id: products.id, active: products.active, inStock: products.inStock })
          .from(products)
          .where(inArray(products.id, productIds))
          .for('update');
        if (
          currentProducts.length !== new Set(productIds).size ||
          currentProducts.some((product) => !product.active || !product.inStock)
        ) {
          throw new AiAdminCapabilityError(
            'One or more featured products are no longer active and in stock. Generate a new proposal.',
            'proposal_dependency_changed',
          );
        }
      }
      const [group] = await tx.insert(featuredProductGroups).values(expectedGroup).returning();
      requirePersistedProposalValues(group, expectedGroup);
      const persistedProducts = await tx
        .insert(featuredProductGroupProducts)
        .values(productIds.map((productId) => ({ groupId: group.id, productId })))
        .returning();
      const featuredProductsVerified =
        persistedProducts.length === productIds.length &&
        productIds.every((productId) =>
          persistedProducts.some((row) => row.groupId === group.id && row.productId === productId),
        );
      if (!featuredProductsVerified)
        throw new AiAdminCapabilityError(
          'The approved featured products could not be verified.',
          'proposal_verification_failed',
        );
    } else if (proposal.proposalType === 'landing_page') {
      const temporarySlug = landingPageSlugFromProduct(
        { slug: String(payload.slug) },
        `${Date.now()}${proposal.id}`,
      );
      const expectedPage = {
        productId: Number(payload.productId),
        locale: z.enum(['fr', 'ar']).parse(payload.locale),
        slug: temporarySlug,
        createdBy: input.actorId ?? null,
        updatedBy: input.actorId ?? null,
      };
      const [page] = await tx.insert(landingPages).values(expectedPage).returning();
      requirePersistedProposalValues(page, expectedPage);
      const slug = landingPageSlugFromProduct({ slug: String(payload.slug) }, page.id);
      const [numberedPage] = await tx
        .update(landingPages)
        .set({ slug })
        .where(eq(landingPages.id, page.id))
        .returning();
      requirePersistedProposalValues(numberedPage, { ...expectedPage, slug });
      const expectedRevision = {
        landingPageId: page.id,
        revision: 1,
        document: payload.document,
        source: 'ai',
        createdBy: input.actorId ?? null,
      };
      const [revision] = await tx.insert(landingPageRevisions).values(expectedRevision).returning();
      requirePersistedProposalValues(revision, expectedRevision);
    } else throw new AiAdminCapabilityError('Unsupported proposal type.');
    const [applied] = await tx
      .update(aiProposals)
      .set({
        status: 'applied',
        reviewedBy: input.actorId ?? null,
        reviewedAt: new Date(),
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
      .returning({ id: aiProposals.id, status: aiProposals.status });
    if (!applied || applied.status !== 'applied')
      throw new AiAdminCapabilityError(
        'The proposal result could not be recorded after verification.',
        'proposal_already_reviewed',
      );
    return {
      id: proposal.id,
      status: 'applied' as const,
      verified: true as const,
      proposalType: proposal.proposalType,
    };
  });
}
