import { evaluateDiscountPrice, getAiConfig, minimumSellingPriceForMargin } from '@bric/ai-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db/client';
import {
  aiPricingPolicies, aiProposals, aiRuns, brands, bundleComponents, bundleListings, categories,
  featuredProductGroupProducts, featuredProductGroups, landingPageRevisions, landingPages, products,
} from '../db/schema';
import { buildDefaultLandingPageDocument, landingPageSlugFromProduct } from './landing-pages';
import { createLandingPageGenerator, generateLandingPageDraft, LANDING_PAGE_PROMPT_VERSION, type LandingPageGenerator } from './ai-landing-page';
import { slugify } from './slug';

const EDIT_FIELDS = {
  products: z.object({ title: z.string().trim().min(1).max(240).optional(), titleAr: z.string().trim().max(240).nullable().optional(), description: z.string().trim().max(20_000).nullable().optional(), descriptionAr: z.string().trim().max(20_000).nullable().optional(), active: z.boolean().optional(), inStock: z.boolean().optional(), brandId: z.number().int().positive().nullable().optional(), categoryId: z.number().int().positive().nullable().optional() }).strict(),
  brands: z.object({ name: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional(), featured: z.boolean().optional() }).strict(),
  categories: z.object({ name: z.string().trim().min(1).max(120).optional(), nameAr: z.string().trim().max(120).nullable().optional(), isActive: z.boolean().optional(), featured: z.boolean().optional(), parentId: z.number().int().positive().nullable().optional() }).strict(),
};
export type EditableEntity = keyof typeof EDIT_FIELDS;
export class AiAdminCapabilityError extends Error {}

async function createProposal(input: { task: string; type: string; entityType: string; entityId: number; sourceUpdatedAt?: Date | null; payload: unknown; reasoning: string; actorId?: string | null; model?: string; promptVersion?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }) {
  const db = getDb();
  const [run] = await db.insert(aiRuns).values({ surface: 'admin', task: input.task, status: 'completed', model: input.model ?? 'deterministic-v1', promptVersion: input.promptVersion ?? `${input.task}-v1`, actorId: input.actorId ?? null, inputTokens: input.usage?.inputTokens, outputTokens: input.usage?.outputTokens, totalTokens: input.usage?.totalTokens, completedAt: new Date() }).returning({ id: aiRuns.id });
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  const [proposal] = await db.insert(aiProposals).values({ runId: run.id, proposalType: input.type, entityType: input.entityType, entityId: input.entityId, sourceUpdatedAt: input.sourceUpdatedAt ?? null, payload: input.payload, reasoning: input.reasoning, requestedBy: input.actorId ?? null, expiresAt }).returning({ id: aiProposals.id });
  return { id: proposal.id, type: input.type, status: 'proposed' as const, reasoning: input.reasoning, expiresAt: expiresAt.toISOString(), payload: input.payload };
}

export async function proposeDiscount(input: { productId: number; percentOff: number; minimumMargin?: number; actorId?: string | null }) {
  const db = getDb();
  const [product] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.active, true))).limit(1);
  if (!product) throw new AiAdminCapabilityError('Active product not found.');
  if (product.purchasePrice == null) throw new AiAdminCapabilityError('Purchase price is required for a margin-safe discount.');
  const [policy] = await db.select().from(aiPricingPolicies).where(eq(aiPricingPolicies.id, 1)).limit(1);
  const defaultMargin = Number(policy?.defaultMinimumGrossMargin ?? 0.15);
  const margin = input.minimumMargin ?? defaultMargin;
  if (input.minimumMargin != null && policy?.allowRequestOverride === false) throw new AiAdminCapabilityError('Margin overrides are disabled.');
  const requestedPrice = Number(product.price) * (1 - input.percentOff / 100);
  const evaluation = evaluateDiscountPrice({ purchaseCost: Number(product.purchasePrice), proposedPrice: requestedPrice, minimumGrossMargin: margin });
  const suggestedPrice = Math.max(requestedPrice, minimumSellingPriceForMargin({ purchaseCost: Number(product.purchasePrice), minimumGrossMargin: margin }));
  if (suggestedPrice >= Number(product.price)) throw new AiAdminCapabilityError('No margin-safe discount is available at the requested margin.');
  return createProposal({ task: 'discount_suggestion', type: 'product_discount', entityType: 'products', entityId: product.id, sourceUpdatedAt: product.updatedAt, actorId: input.actorId, reasoning: `Requested ${input.percentOff}% discount; adjusted to preserve ${(margin * 100).toFixed(1)}% minimum gross margin.`, payload: { before: { price: product.price, oldPrice: product.oldPrice }, changes: { price: suggestedPrice.toFixed(2), oldPrice: product.price }, requestedPercentOff: input.percentOff, minimumGrossMargin: margin, defaultMinimumGrossMargin: defaultMargin, belowDefaultMargin: margin < defaultMargin, evaluation } });
}

export async function proposeFeaturedProducts(input: { name: string; limit?: number; actorId?: string | null }) {
  const db = getDb();
  const limit = input.limit ?? 8;
  const ranked = await db.select({ id: products.id, title: products.title, popularityScore: products.popularityScore, conversionRate: products.conversionRate, unitsSold: products.unitsSold, updatedAt: products.updatedAt }).from(products).where(and(eq(products.active, true), eq(products.inStock, true))).orderBy(desc(products.popularityScore), desc(products.conversionRate), desc(products.unitsSold)).limit(limit);
  if (!ranked.length) throw new AiAdminCapabilityError('No active in-stock products are available.');
  return createProposal({ task: 'featured_product_suggestion', type: 'featured_products', entityType: 'featured_product_groups', entityId: 0, actorId: input.actorId, reasoning: 'Ranked active, in-stock products by popularity, conversion rate, and units sold.', payload: { name: input.name, productIds: ranked.map((row) => row.id), evidence: ranked } });
}

export async function proposeLandingPage(input: { productId: number; locale: 'fr' | 'ar'; campaignAngle?: string; actorId?: string | null; generator?: LandingPageGenerator }) {
  const db = getDb();
  const [product] = await db.select({ id: products.id, title: products.title, titleAr: products.titleAr, description: products.description, descriptionAr: products.descriptionAr, images: products.images, slug: products.slug, sku: products.sku, barcode: products.barcode, brand: brands.name, category: categories.name, updatedAt: products.updatedAt })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, input.productId), eq(products.active, true)))
    .limit(1);
  if (!product) throw new AiAdminCapabilityError('Active product not found.');
  const baseTitle = input.locale === 'ar' && product.titleAr ? product.titleAr : product.title;
  const fallbackDocument = buildDefaultLandingPageDocument({ locale: input.locale, title: baseTitle, description: input.locale === 'ar' ? product.descriptionAr : product.description, imageUrl: product.images[0] ?? null });
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
  return createProposal({
    task: 'landing_page_generation', type: 'landing_page', entityType: 'products', entityId: product.id,
    sourceUpdatedAt: product.updatedAt, actorId: input.actorId, reasoning: generation.reasoning,
    model: generation.model, promptVersion: LANDING_PAGE_PROMPT_VERSION, usage: generation.usage,
    payload: { productId: product.id, locale: input.locale, slug: landingPageSlugFromProduct(product), document: generation.document, generation: { model: generation.model, promptVersion: LANDING_PAGE_PROMPT_VERSION, groundingNotes: generation.groundingNotes, stages: generation.stages } },
  });
}

export async function proposeBundle(input: { title: string; titleAr?: string; components: Array<{ productId: number; quantity: number }>; minimumMargin?: number; actorId?: string | null }) {
  const db = getDb();
  const ids = [...new Set(input.components.map((item) => item.productId))];
  const rows = await db.select().from(products).where(and(inArray(products.id, ids), eq(products.active, true)));
  if (rows.length !== ids.length) throw new AiAdminCapabilityError('Every bundle component must be an active product.');
  const byId = new Map(rows.map((row) => [row.id, row]));
  let cost = 0;
  let retail = 0;
  for (const component of input.components) {
    const product = byId.get(component.productId)!;
    if (product.purchasePrice == null) throw new AiAdminCapabilityError(`Purchase price is missing for product ${product.id}.`);
    cost += Number(product.purchasePrice) * component.quantity;
    retail += Number(product.price) * component.quantity;
  }
  const [policy] = await db.select().from(aiPricingPolicies).where(eq(aiPricingPolicies.id, 1)).limit(1);
  const defaultMargin = Number(policy?.defaultMinimumGrossMargin ?? 0.15);
  const margin = input.minimumMargin ?? defaultMargin;
  if (input.minimumMargin != null && policy?.allowRequestOverride === false) throw new AiAdminCapabilityError('Margin overrides are disabled.');
  const minimumPrice = minimumSellingPriceForMargin({ purchaseCost: cost, minimumGrossMargin: margin });
  const suggestedPrice = Math.min(retail, Math.max(minimumPrice, retail * 0.9));
  return createProposal({ task: 'bundle_suggestion', type: 'bundle_listing', entityType: 'bundle_listings', entityId: 0, actorId: input.actorId, reasoning: `New bundle listing priced with at least ${(margin * 100).toFixed(1)}% gross margin and compared with component retail total.`, payload: { title: input.title, titleAr: input.titleAr ?? null, components: input.components.map((item) => ({ ...item, unitPurchasePriceSnapshot: byId.get(item.productId)!.purchasePrice })), totalPurchaseCost: cost.toFixed(2), componentRetailTotal: retail.toFixed(2), price: suggestedPrice.toFixed(2), minimumGrossMargin: margin, defaultMinimumGrossMargin: defaultMargin, belowDefaultMargin: margin < defaultMargin } });
}

export async function proposeEntityEdit(input: { entityType: EditableEntity; entityId: number; changes: unknown; actorId?: string | null }) {
  const changes = EDIT_FIELDS[input.entityType].parse(input.changes);
  if (!Object.keys(changes).length) throw new AiAdminCapabilityError('At least one supported field must change.');
  const db = getDb();
  const table = input.entityType === 'products' ? products : input.entityType === 'brands' ? brands : categories;
  const [entity] = await db.select().from(table as typeof products).where(eq((table as typeof products).id, input.entityId)).limit(1);
  if (!entity) throw new AiAdminCapabilityError('Entity not found.');
  return createProposal({ task: 'catalog_entity_edit', type: 'entity_edit', entityType: input.entityType, entityId: input.entityId, sourceUpdatedAt: entity.updatedAt, actorId: input.actorId, reasoning: `Reviewable ${input.entityType} field edit requested through admin chat.`, payload: { before: Object.fromEntries(Object.keys(changes).map((key) => [key, (entity as Record<string, unknown>)[key]])), changes } });
}

export async function reviewAdminProposal(input: { proposalId: number; action: 'approve' | 'reject'; actorId?: string | null }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(aiProposals).where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed'))).limit(1);
    if (!proposal) throw new AiAdminCapabilityError('Proposal is unavailable or already reviewed.');
    if (input.action === 'reject') { await tx.update(aiProposals).set({ status: 'rejected', reviewedBy: input.actorId ?? null, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(aiProposals.id, proposal.id)); return { id: proposal.id, status: 'rejected' as const, proposalType: proposal.proposalType }; }
    if (proposal.expiresAt <= new Date()) throw new AiAdminCapabilityError('Proposal expired.');
    const payload = proposal.payload as Record<string, any>;
    if (proposal.sourceUpdatedAt) {
      const table = proposal.entityType === 'products' ? products : proposal.entityType === 'brands' ? brands : proposal.entityType === 'categories' ? categories : null;
      if (table) { const [current] = await tx.select({ updatedAt: table.updatedAt }).from(table).where(eq(table.id, proposal.entityId)).limit(1); if (!current || current.updatedAt.getTime() !== proposal.sourceUpdatedAt.getTime()) throw new AiAdminCapabilityError('Proposal is stale. Generate it again.'); }
    }
    if (proposal.proposalType === 'product_discount') await tx.update(products).set({ ...payload.changes, updatedAt: new Date() }).where(eq(products.id, proposal.entityId));
    else if (proposal.proposalType === 'entity_edit') {
      if (proposal.entityType === 'products') await tx.update(products).set({ ...EDIT_FIELDS.products.parse(payload.changes), updatedAt: new Date() }).where(eq(products.id, proposal.entityId));
      else if (proposal.entityType === 'brands') await tx.update(brands).set({ ...EDIT_FIELDS.brands.parse(payload.changes), updatedAt: new Date() }).where(eq(brands.id, proposal.entityId));
      else if (proposal.entityType === 'categories') await tx.update(categories).set({ ...EDIT_FIELDS.categories.parse(payload.changes), updatedAt: new Date() }).where(eq(categories.id, proposal.entityId));
    } else if (proposal.proposalType === 'featured_products') {
      const [group] = await tx.insert(featuredProductGroups).values({ name: String(payload.name), active: false }).returning({ id: featuredProductGroups.id });
      await tx.insert(featuredProductGroupProducts).values((payload.productIds as number[]).map((productId) => ({ groupId: group.id, productId })));
    } else if (proposal.proposalType === 'bundle_listing') {
      const suffix = `${Date.now()}-${proposal.id}`;
      const [product] = await tx.insert(products).values({ title: String(payload.title), titleAr: payload.titleAr, slug: `${slugify(String(payload.title))}-${suffix}`, price: String(payload.price), purchasePrice: String(payload.totalPurchaseCost), active: false, inStock: true, inventoryQuantity: 0 }).returning({ id: products.id });
      const [bundle] = await tx.insert(bundleListings).values({ productId: product.id, active: false, createdBy: input.actorId ?? null }).returning({ id: bundleListings.id });
      await tx.insert(bundleComponents).values((payload.components as Array<any>).map((item) => ({ bundleId: bundle.id, productId: item.productId, quantity: item.quantity, unitPurchasePriceSnapshot: item.unitPurchasePriceSnapshot })));
    } else if (proposal.proposalType === 'landing_page') {
      const [page] = await tx.insert(landingPages).values({ productId: Number(payload.productId), locale: payload.locale, slug: String(payload.slug), createdBy: input.actorId ?? null, updatedBy: input.actorId ?? null }).returning({ id: landingPages.id });
      await tx.insert(landingPageRevisions).values({ landingPageId: page.id, revision: 1, document: payload.document, source: 'ai', createdBy: input.actorId ?? null });
    } else throw new AiAdminCapabilityError('Unsupported proposal type.');
    await tx.update(aiProposals).set({ status: 'applied', reviewedBy: input.actorId ?? null, reviewedAt: new Date(), appliedAt: new Date(), updatedAt: new Date() }).where(eq(aiProposals.id, proposal.id));
    return { id: proposal.id, status: 'applied' as const, proposalType: proposal.proposalType };
  });
}
