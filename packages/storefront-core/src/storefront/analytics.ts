import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "../../../db/src/client";
import {
  analyticsEvents,
  analyticsJourneys,
  brands,
  categories,
  orders,
  products,
} from "../../../db/src/schema";

type Database = ReturnType<typeof getDb>;

const nullableTrimmedString = (max: number) =>
  z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, max);
  });

const nullablePositiveInt = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
});

const nullablePositiveNumber = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
});

const analyticsItemSchema = z.object({
  productId: nullablePositiveInt,
  productSlug: nullableTrimmedString(180),
  categoryId: nullablePositiveInt,
  categorySlug: nullableTrimmedString(180),
  brandId: nullablePositiveInt,
  brandSlug: nullableTrimmedString(180),
  quantity: nullablePositiveInt,
  price: nullablePositiveNumber,
});

export const storefrontAnalyticsEventNameSchema = z.enum([
  "session_start",
  "page_view",
  "select_item",
  "view_item",
  "search",
  "filter_apply",
  "sort_change",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "checkout_submit",
  "purchase",
  "api_error",
]);

export const storefrontAnalyticsEventSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
  journeyId: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
  eventName: storefrontAnalyticsEventNameSchema,
  gaEventName: nullableTrimmedString(120),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  pagePath: nullableTrimmedString(250),
  pageType: nullableTrimmedString(80),
  locale: nullableTrimmedString(12),
  referrer: nullableTrimmedString(500),
  utmSource: nullableTrimmedString(120),
  utmMedium: nullableTrimmedString(120),
  utmCampaign: nullableTrimmedString(180),
  utmTerm: nullableTrimmedString(180),
  utmContent: nullableTrimmedString(180),
  productId: nullablePositiveInt,
  productSlug: nullableTrimmedString(180),
  categoryId: nullablePositiveInt,
  categorySlug: nullableTrimmedString(180),
  brandId: nullablePositiveInt,
  brandSlug: nullableTrimmedString(180),
  orderId: nullablePositiveInt,
  searchTerm: nullableTrimmedString(250),
  quantity: nullablePositiveInt,
  value: nullablePositiveNumber,
  currency: z.string().trim().min(1).max(12).default("DZD"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type StorefrontAnalyticsEvent = z.infer<typeof storefrontAnalyticsEventSchema>;

function computePopularitySql(
  table: typeof products | typeof categories | typeof brands,
  addView: number,
  addCart: number,
  addCheckout: number,
  addPurchase: number,
) {
  return sql`(
    (${table.viewCount} + ${addView})::numeric
    + ((${table.addToCartCount} + ${addCart})::numeric * 3)
    + ((${table.checkoutCount} + ${addCheckout})::numeric * 5)
    + ((${table.purchaseCount} + ${addPurchase})::numeric * 8)
  )`;
}

function computeConversionSql(
  table: typeof products | typeof categories | typeof brands,
  addView: number,
  addPurchase: number,
) {
  return sql`case
    when (${table.viewCount} + ${addView}) > 0
      then ((${table.purchaseCount} + ${addPurchase})::numeric / (${table.viewCount} + ${addView})::numeric)
    else 0
  end`;
}

function extractItems(event: StorefrontAnalyticsEvent) {
  const rawItems = Array.isArray(event.metadata.items) ? event.metadata.items : [];
  const parsedItems = rawItems
    .map((item) => analyticsItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (parsedItems.length > 0) {
    return parsedItems;
  }

  if (!event.productId && !event.productSlug) {
    return [];
  }

  return [
    {
      productId: event.productId,
      productSlug: event.productSlug,
      categoryId: event.categoryId,
      categorySlug: event.categorySlug,
      brandId: event.brandId,
      brandSlug: event.brandSlug,
      quantity: event.quantity ?? 1,
      price: event.value,
    },
  ];
}

async function updateCatalogMetrics(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  event: StorefrontAnalyticsEvent,
) {
  const items = extractItems(event);
  const metricBump = {
    view: event.eventName === "view_item" ? 1 : 0,
    cart: event.eventName === "add_to_cart" ? 1 : 0,
    checkout: event.eventName === "begin_checkout" ? 1 : 0,
    purchase: event.eventName === "purchase" ? 1 : 0,
  };

  if (metricBump.view === 0 && metricBump.cart === 0 && metricBump.checkout === 0 && metricBump.purchase === 0) {
    return;
  }

  for (const item of items) {
    const quantity = Math.max(1, item.quantity ?? 1);
    const productView = metricBump.view;
    const productCart = metricBump.cart * quantity;
    const productCheckout = metricBump.checkout * quantity;
    const productPurchase = metricBump.purchase * quantity;

    if (item.productId) {
      await tx
        .update(products)
        .set({
          viewCount: sql`${products.viewCount} + ${productView}`,
          addToCartCount: sql`${products.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${products.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${products.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(products, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(products, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${products.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(products.id, item.productId));
    }

    if (item.categoryId) {
      await tx
        .update(categories)
        .set({
          viewCount: sql`${categories.viewCount} + ${productView}`,
          addToCartCount: sql`${categories.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${categories.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${categories.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(categories, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(categories, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${categories.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(categories.id, item.categoryId));
    }

    if (item.brandId) {
      await tx
        .update(brands)
        .set({
          viewCount: sql`${brands.viewCount} + ${productView}`,
          addToCartCount: sql`${brands.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${brands.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${brands.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(brands, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(brands, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${brands.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(brands.id, item.brandId));
    }
  }
}

export async function ingestStorefrontAnalyticsEvent(
  db: Database,
  rawEvent: StorefrontAnalyticsEvent,
) {
  const event = storefrontAnalyticsEventSchema.parse(rawEvent);
  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

  return db.transaction(async (tx) => {
    await tx
      .insert(analyticsJourneys)
      .values({
        id: event.journeyId,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        firstPath: event.pagePath,
        lastPath: event.pagePath,
        locale: event.locale,
        referrer: event.referrer,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        utmTerm: event.utmTerm,
        utmContent: event.utmContent,
      })
      .onConflictDoUpdate({
        target: analyticsJourneys.id,
        set: {
          lastSeenAt: occurredAt,
          lastPath: event.pagePath ?? sql`${analyticsJourneys.lastPath}`,
          locale: event.locale ?? sql`${analyticsJourneys.locale}`,
          referrer: event.referrer ?? sql`${analyticsJourneys.referrer}`,
          utmSource: sql`coalesce(${analyticsJourneys.utmSource}, ${event.utmSource})`,
          utmMedium: sql`coalesce(${analyticsJourneys.utmMedium}, ${event.utmMedium})`,
          utmCampaign: sql`coalesce(${analyticsJourneys.utmCampaign}, ${event.utmCampaign})`,
          utmTerm: sql`coalesce(${analyticsJourneys.utmTerm}, ${event.utmTerm})`,
          utmContent: sql`coalesce(${analyticsJourneys.utmContent}, ${event.utmContent})`,
        },
      });

    const insertedRows = await tx
      .insert(analyticsEvents)
      .values({
        eventId: event.eventId,
        journeyId: event.journeyId,
        sessionId: event.sessionId,
        eventName: event.eventName,
        gaEventName: event.gaEventName,
        pagePath: event.pagePath,
        pageType: event.pageType,
        locale: event.locale,
        referrer: event.referrer,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        utmTerm: event.utmTerm,
        utmContent: event.utmContent,
        productId: event.productId,
        productSlug: event.productSlug,
        categoryId: event.categoryId,
        categorySlug: event.categorySlug,
        brandId: event.brandId,
        brandSlug: event.brandSlug,
        orderId: event.orderId,
        searchTerm: event.searchTerm,
        quantity: event.quantity,
        value: event.value == null ? null : event.value.toFixed(2),
        currency: event.currency,
        metadata: event.metadata,
        occurredAt,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: analyticsEvents.eventId })
      .returning({ id: analyticsEvents.id });

    if (insertedRows.length === 0) {
      return { ok: true as const, deduped: true };
    }

    if (event.eventName === "purchase") {
      await tx
        .update(analyticsJourneys)
        .set({
          orderCount: sql`${analyticsJourneys.orderCount} + 1`,
          purchaseCount: sql`${analyticsJourneys.purchaseCount} + 1`,
          firstOrderId: sql`coalesce(${analyticsJourneys.firstOrderId}, ${event.orderId})`,
        })
        .where(eq(analyticsJourneys.id, event.journeyId));
    }

    await updateCatalogMetrics(tx, event);

    return { ok: true as const, deduped: false };
  });
}

export function buildAnalyticsDateWhere(
  filters: { startDate?: string | null; endDate?: string | null },
) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(gte(analyticsEvents.occurredAt, new Date(`${filters.startDate}T00:00:00.000Z`)));
  }

  if (filters.endDate) {
    conditions.push(lte(analyticsEvents.occurredAt, new Date(`${filters.endDate}T23:59:59.999Z`)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function attachJourneyToOrder(
  db: Database,
  orderId: number,
  journeyId: string | null,
  _sessionId: string | null,
) {
  if (!journeyId) {
    return;
  }

  await db
    .update(analyticsJourneys)
    .set({
      firstOrderId: sql`coalesce(${analyticsJourneys.firstOrderId}, ${orderId})`,
    })
    .where(eq(analyticsJourneys.id, journeyId));
}
