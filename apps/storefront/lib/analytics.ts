'use client';

import { z } from 'zod';

import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';

import { buildMetaServerEvent, deliverClientMarketingEvent } from '@/lib/marketing-destinations';
import {
  captureStorefrontAttribution,
  getStorefrontAnalyticsContext,
} from '@/lib/marketing-attribution';

const productEventNameSchema = z.enum([
  'view_item',
  'view_item_media',
  'add_to_cart',
  'buy_now_click',
  'web_vital',
  'api_error',
]);

const catalogEventNameSchema = z.enum([
  'view_item_list',
  'search',
  'filter_apply',
  'sort_change',
  'select_item',
]);

const navigationEventNameSchema = z.enum([
  'navigation_click',
  'navigation_menu_open',
  'locale_change',
  'search',
  'select_item',
  'view_cart',
  'add_to_cart',
  'remove_from_cart',
  'cart_checkout_click',
  'ai_assistant_open',
  'ai_assistant_message',
  'ai_assistant_result_click',
  'ai_assistant_error',
]);

const checkoutEventNameSchema = z.enum([
  'begin_checkout',
  'checkout_submit_attempt',
  'order_create_success',
  'order_create_failed',
  'order_verification_failed_after_create',
  'purchase',
]);

const checkoutCommerceItemSchema = z
  .object({
    productId: z.number().int().positive(),
    productSlug: z.string().trim().min(1).max(180).nullable().default(null),
    quantity: z.number().int().positive().max(50),
    price: z.number().min(0),
  })
  .strict();

const productEventInputSchema = z.object({
  eventName: productEventNameSchema,
  locale: z.enum(['fr', 'ar']),
  productId: z.number().int().positive().nullable().default(null),
  productSlug: z.string().trim().min(1).max(180).nullable().default(null),
  categoryId: z.number().int().positive().nullable().default(null),
  categorySlug: z.string().trim().min(1).max(180).nullable().default(null),
  brandId: z.number().int().positive().nullable().default(null),
  brandSlug: z.string().trim().min(1).max(180).nullable().default(null),
  quantity: z.number().int().positive().nullable().default(null),
  value: z.number().min(0).nullable().default(null),
  metadata: z
    .object({
      metricId: z.string().max(120).optional(),
      metricName: z.enum(['LCP', 'INP', 'CLS']).optional(),
      metricValue: z.number().optional(),
      metricRating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
      navigationType: z.string().max(80).optional(),
      mediaAction: z.enum(['open', 'navigate']).optional(),
      mediaIndex: z.number().int().min(0).optional(),
      mediaCount: z.number().int().positive().optional(),
      resultsCount: z.number().int().min(0).optional(),
      page: z.number().int().positive().optional(),
      sort: z.enum(['recommended', 'newest', 'price-asc', 'price-desc', 'name-asc']).optional(),
      listContext: z.enum(['catalog', 'similar_products']).optional(),
      filterKind: z.enum(['category', 'brand', 'discounted']).optional(),
      discounted: z.boolean().optional(),
      filterId: z.number().int().positive().optional(),
      position: z.number().int().positive().optional(),
      visibleProductIds: z.array(z.number().int().positive()).max(24).optional(),
      landingPageId: z.number().int().positive().optional(),
      landingRevision: z.number().int().positive().optional(),
      landingBlockId: z.string().trim().min(1).max(80).optional(),
    })
    .strict()
    .default({}),
});

const catalogEventInputSchema = z.object({
  eventName: catalogEventNameSchema,
  locale: z.enum(['fr', 'ar']),
  productId: z.number().int().positive().nullable().default(null),
  productSlug: z.string().trim().min(1).max(180).nullable().default(null),
  categoryId: z.number().int().positive().nullable().default(null),
  brandId: z.number().int().positive().nullable().default(null),
  searchTerm: z.string().trim().max(80).nullable().default(null),
  metadata: productEventInputSchema.shape.metadata,
});

const navigationEventInputSchema = z
  .object({
    eventName: navigationEventNameSchema,
    locale: z.enum(['fr', 'ar']),
    productId: z.number().int().positive().nullable().default(null),
    productSlug: z.string().trim().min(1).max(180).nullable().default(null),
    categoryId: z.number().int().positive().nullable().default(null),
    brandId: z.number().int().positive().nullable().default(null),
    searchTerm: z.string().trim().max(80).nullable().default(null),
    quantity: z.number().int().positive().nullable().default(null),
    value: z.number().min(0).nullable().default(null),
    metadata: z
      .object({
        surface: z.enum([
          'header',
          'mobile_drawer',
          'global_search',
          'cart_drawer',
          'product_detail',
          'checkout',
          'thank_you',
          'ai_assistant',
        ]),
        target: z.string().trim().min(1).max(120).optional(),
        resultsCount: z.number().int().min(0).optional(),
        position: z.number().int().positive().optional(),
        intent: z
          .enum([
            'product_search',
            'product_comparison',
            'compatibility',
            'price',
            'availability',
            'how_to',
            'recommendation',
            'other',
          ])
          .optional(),
      })
      .strict(),
  })
  .superRefine((input, context) => {
    if (input.eventName.startsWith('ai_assistant_') && input.searchTerm !== null) {
      context.addIssue({
        code: 'custom',
        path: ['searchTerm'],
        message: 'Assistant conversation text must not be collected',
      });
    }
  });

const checkoutEventInputSchema = z.object({
  eventId: z.string().trim().min(1).max(120).optional(),
  eventName: checkoutEventNameSchema,
  locale: z.enum(['fr', 'ar']),
  orderId: z.number().int().positive().nullable().default(null),
  quantity: z.number().int().positive().nullable().default(null),
  value: z.number().min(0).nullable().default(null),
  metadata: z
    .object({
      cartMode: z.enum(['cart', 'direct']),
      itemCount: z.number().int().min(0),
      items: z.array(checkoutCommerceItemSchema).max(50).optional(),
      delivery: z.enum(['home', 'office']).optional(),
      failureCode: z.string().trim().min(1).max(80).optional(),
      verificationSource: z.enum(['server', 'snapshot']).optional(),
      landingPageId: z.number().int().positive().optional(),
      landingRevision: z.number().int().positive().optional(),
    })
    .strict(),
});

const pageEventInputSchema = z.object({
  eventId: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(['fr', 'ar']),
  pageType: z.enum(['homepage', 'catalog', 'product_detail', 'landing', 'checkout', 'thank_you']),
});

export type ProductAnalyticsEventInput = z.input<typeof productEventInputSchema>;
export type CatalogAnalyticsEventInput = z.input<typeof catalogEventInputSchema>;
export type NavigationAnalyticsEventInput = z.input<typeof navigationEventInputSchema>;
export type CheckoutAnalyticsEventInput = z.input<typeof checkoutEventInputSchema>;
export type PageAnalyticsEventInput = z.input<typeof pageEventInputSchema>;

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

export function sanitizeAnalyticsReferrer(value: string, currentOrigin: string) {
  if (!value) return null;
  try {
    const referrer = new URL(value);
    return referrer.origin === currentOrigin
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return null;
  }
}

export function buildProductAnalyticsPayload(input: ProductAnalyticsEventInput) {
  const parsed = productEventInputSchema.parse(input);
  return buildAnalyticsPayload(parsed, 'product_detail');
}

function buildAnalyticsPayload(
  parsed:
    | z.output<typeof productEventInputSchema>
    | z.output<typeof catalogEventInputSchema>
    | z.output<typeof navigationEventInputSchema>
    | z.output<typeof checkoutEventInputSchema>
    | (z.output<typeof pageEventInputSchema> & { eventName: 'page_view' }),
  pageType:
    | 'homepage'
    | 'product_detail'
    | 'catalog'
    | 'landing'
    | 'global_navigation'
    | 'checkout'
    | 'thank_you',
) {
  const attribution = captureStorefrontAttribution();
  const analytics = getStorefrontAnalyticsContext();
  const connection = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };

  return {
    eventVersion: 1 as const,
    eventId: 'eventId' in parsed && parsed.eventId ? parsed.eventId : createId(),
    visitId: attribution.visitId,
    journeyId: analytics.journeyId,
    sessionId: analytics.sessionId,
    eventName: parsed.eventName,
    occurredAt: new Date().toISOString(),
    pagePath: window.location.pathname,
    pageType,
    locale: parsed.locale,
    referrer: analytics.entry.referrer,
    utmSource: analytics.entry.utmSource,
    utmMedium: analytics.entry.utmMedium,
    utmCampaign: analytics.entry.utmCampaign,
    utmTerm: analytics.entry.utmTerm,
    utmContent: analytics.entry.utmContent,
    productId: 'productId' in parsed ? parsed.productId : null,
    productSlug: 'productSlug' in parsed ? parsed.productSlug : null,
    categoryId: 'categoryId' in parsed ? parsed.categoryId : null,
    categorySlug: 'categorySlug' in parsed ? parsed.categorySlug : null,
    brandId: 'brandId' in parsed ? parsed.brandId : null,
    brandSlug: 'brandSlug' in parsed ? parsed.brandSlug : null,
    searchTerm: 'searchTerm' in parsed ? parsed.searchTerm : null,
    quantity: 'quantity' in parsed ? parsed.quantity : null,
    value: 'value' in parsed ? parsed.value : null,
    orderId: 'orderId' in parsed ? parsed.orderId : null,
    currency: 'DZD',
    metadata: {
      storefrontProject: STOREFRONT_ANALYTICS_PROJECT,
      viewportClass:
        window.innerWidth < 480 ? 'small_phone' : window.innerWidth < 768 ? 'mobile' : 'desktop',
      effectiveConnectionType: connection.connection?.effectiveType ?? null,
      saveData: connection.connection?.saveData ?? false,
      release: process.env.NEXT_PUBLIC_RELEASE ?? null,
      landingUrl: attribution.landingUrl,
      landingHost: attribution.landingHost,
      fbc: attribution.fbc,
      paidClickCookie: analytics.entry.hasMetaClickId,
      sessionStartedAt: new Date(analytics.sessionStartedAt).toISOString(),
      acquisitionChannel: analytics.classification.channel,
      acquisitionEvidence: analytics.classification.evidence,
      hasMetaClickId: analytics.entry.hasMetaClickId,
      hasGoogleClickId: analytics.entry.hasGoogleClickId,
      hasTikTokClickId: analytics.entry.hasTikTokClickId,
      ...('metadata' in parsed ? parsed.metadata : {}),
    },
  };
}

export function buildCatalogAnalyticsPayload(input: CatalogAnalyticsEventInput) {
  return buildAnalyticsPayload(catalogEventInputSchema.parse(input), 'catalog');
}

export function buildNavigationAnalyticsPayload(input: NavigationAnalyticsEventInput) {
  return buildAnalyticsPayload(navigationEventInputSchema.parse(input), 'global_navigation');
}

export function buildCheckoutAnalyticsPayload(
  input: CheckoutAnalyticsEventInput,
  pageType: 'checkout' | 'thank_you' = 'checkout',
) {
  return buildAnalyticsPayload(checkoutEventInputSchema.parse(input), pageType);
}

export function buildPageAnalyticsPayload(input: PageAnalyticsEventInput) {
  const parsed = pageEventInputSchema.parse(input);
  return buildAnalyticsPayload({ ...parsed, eventName: 'page_view' }, parsed.pageType);
}

export type StorefrontAnalyticsPayload = ReturnType<typeof buildAnalyticsPayload>;

export function getAnalyticsIdentity() {
  if (typeof window === 'undefined') return { visitId: null, journeyId: null, sessionId: null };
  const analytics = getStorefrontAnalyticsContext();
  return {
    visitId: captureStorefrontAttribution().visitId,
    journeyId: analytics.journeyId,
    sessionId: analytics.sessionId,
  };
}

async function sendAnalyticsPayload(payload: ReturnType<typeof buildAnalyticsPayload>) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Analytics is intentionally non-blocking.
  }
}

async function sendMetaServerPayload(payload: StorefrontAnalyticsPayload) {
  const event = buildMetaServerEvent(payload);
  if (!event) return;
  try {
    await fetch('/api/marketing/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // The first-party event remains authoritative if Meta is unavailable.
  }
}

async function deliverAnalyticsPayload(payload: StorefrontAnalyticsPayload) {
  const destinations = deliverClientMarketingEvent(payload);
  const observablePayload = {
    ...payload,
    metadata: {
      ...payload.metadata,
      metaTracking: {
        eventName: destinations.meta.eventName,
        eventId: payload.eventId,
        pixel: { invoked: destinations.meta.invoked },
      },
    },
  };
  const firstParty = sendAnalyticsPayload(observablePayload);
  void sendMetaServerPayload(payload);
  await firstParty;
}

export async function trackProductEvent(input: ProductAnalyticsEventInput) {
  if (typeof window === 'undefined') return null;

  let payload;
  try {
    payload = buildProductAnalyticsPayload(input);
  } catch {
    return null;
  }

  await deliverAnalyticsPayload(payload);

  return payload;
}

export async function trackCatalogEvent(input: CatalogAnalyticsEventInput) {
  if (typeof window === 'undefined') return null;

  let payload;
  try {
    payload = buildCatalogAnalyticsPayload(input);
  } catch {
    return null;
  }

  await deliverAnalyticsPayload(payload);
  return payload;
}

export async function trackNavigationEvent(input: NavigationAnalyticsEventInput) {
  if (typeof window === 'undefined') return null;

  let payload;
  try {
    payload = buildNavigationAnalyticsPayload(input);
  } catch {
    return null;
  }

  await deliverAnalyticsPayload(payload);
  return payload;
}

export async function trackCheckoutEvent(
  input: CheckoutAnalyticsEventInput,
  pageType: 'checkout' | 'thank_you' = 'checkout',
) {
  if (typeof window === 'undefined') return null;
  let payload;
  try {
    payload = buildCheckoutAnalyticsPayload(input, pageType);
  } catch {
    return null;
  }
  await deliverAnalyticsPayload(payload);
  return payload;
}

export async function trackPageView(input: PageAnalyticsEventInput) {
  if (typeof window === 'undefined') return null;
  let payload;
  try {
    payload = buildPageAnalyticsPayload(input);
  } catch {
    return null;
  }
  await deliverAnalyticsPayload(payload);
  return payload;
}
