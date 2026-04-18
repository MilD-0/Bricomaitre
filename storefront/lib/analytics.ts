"use client";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const JOURNEY_STORAGE_KEY = "analytics:journey-id";
const SESSION_STORAGE_KEY = "analytics:session-id";
const SESSION_STARTED_KEY = "analytics:session-started";
const VISIT_COOKIE_NAME = "bric_visit_id";
const VARIANT_COOKIE_NAME = "bric_sf_variant";

type AnalyticsItem = {
  productId?: number | null;
  productSlug?: string | null;
  categoryId?: number | null;
  categorySlug?: string | null;
  brandId?: number | null;
  brandSlug?: string | null;
  quantity?: number | null;
  price?: number | null;
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
};

type AnalyticsEventInput = {
  eventId?: string | null;
  eventName: string;
  gaEventName?: string | null;
  visitId?: string | null;
  occurredAt?: string | null;
  pagePath?: string | null;
  pageType?: string | null;
  locale?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  productId?: number | null;
  productSlug?: string | null;
  categoryId?: number | null;
  categorySlug?: string | null;
  brandId?: number | null;
  brandSlug?: string | null;
  orderId?: number | null;
  searchTerm?: string | null;
  quantity?: number | null;
  value?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
  gaParams?: Record<string, unknown>;
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== "function") {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
    };
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function getOrCreateJourneyId() {
  if (typeof window === "undefined") {
    return "";
  }

  const current = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
  if (current) {
    return current;
  }

  const next = createId();
  window.localStorage.setItem(JOURNEY_STORAGE_KEY, next);
  return next;
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const current = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (current) {
    return current;
  }

  const next = createId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

export function getVisitIdFromCookie() {
  return readCookie(VISIT_COOKIE_NAME);
}

export function markSessionStarted() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.sessionStorage.getItem(SESSION_STARTED_KEY) === "1") {
    return false;
  }

  window.sessionStorage.setItem(SESSION_STARTED_KEY, "1");
  return true;
}

function getUtmValues() {
  if (typeof window === "undefined") {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmTerm: params.get("utm_term"),
    utmContent: params.get("utm_content"),
  };
}

function getClientMetadata() {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    landingUrl: window.location.href,
    landingHost: window.location.host,
    userAgent: window.navigator.userAgent,
    fbc: readCookie("_fbc"),
    paidClickCookie: readCookie("bric_paid_click") === "1",
    paidClickSeenAt: readCookie("bric_paid_click_seen_at"),
  };
}

function getExperimentMetadata() {
  if (typeof window === "undefined") {
    return {
      storefrontVariant: "new",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const queryVariant = params.get("sf_variant");
  const cookieVariant = readCookie(VARIANT_COOKIE_NAME);
  const pinnedVariant =
    queryVariant === "legacy" || queryVariant === "new"
      ? queryVariant
      : cookieVariant === "legacy" || cookieVariant === "new"
        ? cookieVariant
        : null;

  return {
    storefrontVariant: "new",
    ...(pinnedVariant
      ? {
          experimentMode: "campaign_pinned",
          experimentSource: "meta_campaign",
          requestedVariant: pinnedVariant,
        }
      : {}),
  };
}

export function getPageType(pathname: string) {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/products/")) return "product_detail";
  if (pathname === "/products") return "product_listing";
  if (pathname.startsWith("/brands/")) return "brand_listing";
  if (pathname.startsWith("/categories/")) return "category_listing";
  if (pathname === "/cart") return "cart";
  if (pathname === "/checkout") return "checkout";
  if (pathname === "/thank-you") return "thank_you";
  if (pathname.startsWith("/landing/")) return "landing";
  return "content";
}

export function toAnalyticsItem(product: Record<string, unknown>): AnalyticsItem {
  const productId =
    typeof product.id === "number"
      ? product.id
      : typeof product._id === "string" && Number.isInteger(Number(product._id))
        ? Number(product._id)
        : null;
  const category = (product.categoryInfo ?? null) as Record<string, unknown> | null;
  const brand = (product.brandInfo ?? null) as Record<string, unknown> | null;

  return {
    productId,
    productSlug: typeof product.slug === "string" ? product.slug : null,
    categoryId: typeof category?.id === "number" ? category.id : null,
    categorySlug: typeof category?.slug === "string" ? category.slug : null,
    brandId: typeof brand?.id === "number" ? brand.id : null,
    brandSlug: typeof brand?.slug === "string" ? brand.slug : null,
    quantity: 1,
    price: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
    item_id: String(productId ?? product._id ?? product.slug ?? ""),
    item_name: typeof product.title === "string" ? product.title : "",
    item_brand: typeof brand?.name === "string" ? brand.name : undefined,
    item_category: typeof category?.name === "string" ? category.name : undefined,
  };
}

export async function trackAnalyticsEvent(input: AnalyticsEventInput) {
  if (typeof window === "undefined") {
    return;
  }

  const journeyId = getOrCreateJourneyId();
  const sessionId = getOrCreateSessionId();
  const visitId = input.visitId ?? getVisitIdFromCookie();
  const utmValues = getUtmValues();
  const eventId = input.eventId ?? createId();
  const payload = {
    eventId,
    visitId,
    journeyId,
    sessionId,
    eventName: input.eventName,
    gaEventName: input.gaEventName ?? input.eventName,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    pagePath: input.pagePath ?? window.location.pathname,
    pageType: input.pageType ?? getPageType(window.location.pathname),
    locale: input.locale ?? document.documentElement.lang ?? null,
    referrer: input.referrer ?? (document.referrer || null),
    utmSource: input.utmSource ?? utmValues.utmSource,
    utmMedium: input.utmMedium ?? utmValues.utmMedium,
    utmCampaign: input.utmCampaign ?? utmValues.utmCampaign,
    utmTerm: input.utmTerm ?? utmValues.utmTerm,
    utmContent: input.utmContent ?? utmValues.utmContent,
    productId: input.productId ?? null,
    productSlug: input.productSlug ?? null,
    categoryId: input.categoryId ?? null,
    categorySlug: input.categorySlug ?? null,
    brandId: input.brandId ?? null,
    brandSlug: input.brandSlug ?? null,
    orderId: input.orderId ?? null,
    searchTerm: input.searchTerm ?? null,
    quantity: input.quantity ?? null,
    value: input.value ?? null,
    currency: input.currency ?? "DZD",
    metadata: {
      ...getClientMetadata(),
      ...getExperimentMetadata(),
      ...(input.metadata ?? {}),
    },
  };

  ensureGtag();
  const gtag = window.gtag;
  if (gtag) {
    gtag("event", input.gaEventName ?? input.eventName, {
      send_to: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      page_path: payload.pagePath,
      page_location: window.location.href,
      visit_id: visitId,
      journey_id: journeyId,
      session_id: sessionId,
      value: payload.value,
      currency: payload.currency,
      ...input.gaParams,
    });
  }

  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Analytics event failed", error);
  }

  return payload;
}

export function buildItemArray(products: Array<Record<string, unknown>>) {
  return products.map((product) => toAnalyticsItem(product));
}
