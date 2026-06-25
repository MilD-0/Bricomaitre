import { v4 as uuidv4 } from "uuid";

import {
  buildItemArray,
  getOrCreateJourneyId,
  getOrCreateSessionId,
  getVisitIdFromCookie,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import {
  getMetaNavigationKey,
  runMetaEventOnce,
} from "@/lib/meta-event-dedupe";

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  return parts.length === 2 ? parts.pop().split(";").shift() : null;
}

export function captureFbclidFromLocation() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("fbclid")?.trim()
    || getCookie("_bric_fbclid");
}

function getMetaContentId(product) {
  const value = product?.id;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return String(value);
}

function getQuantity(product) {
  return typeof product?.quantity === "number"
    && Number.isInteger(product.quantity)
    && product.quantity > 0
      ? product.quantity
      : 1;
}

function buildMetaCommerceData(products, value) {
  const contents = (Array.isArray(products) ? products : [])
    .map((product) => {
      const id = getMetaContentId(product);
      if (!id) return null;
      const price = typeof product?.price === "number"
        ? product.price
        : Number(product?.price ?? 0);
      return {
        id,
        quantity: getQuantity(product),
        item_price: Number.isFinite(price) ? price : 0,
      };
    })
    .filter(Boolean);

  return {
    content_ids: contents.map((item) => item.id),
    contents,
    content_type: "product",
    value,
    currency: "DZD",
  };
}

function consumeInitialViewContentEvent(product) {
  if (typeof window === "undefined") return null;
  const pending = window.__bricInitialViewContent;
  if (!pending || typeof pending !== "object") return null;
  const productKey = getMetaContentId(product);
  if (!productKey || pending.productKey !== productKey) return null;
  const eventId = typeof pending.eventId === "string" && pending.eventId.trim()
    ? pending.eventId.trim()
    : null;
  const browserEventSent = pending.browserEventSent === true;
  window.__bricInitialViewContent = null;
  return eventId ? { eventId, browserEventSent } : null;
}

function waitForFbq(timeoutMs = 3000) {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (typeof window.fbq === "function") return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (typeof window.fbq === "function") return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      window.setTimeout(check, 50);
    };
    check();
  });
}

async function trackFacebookEvent({
  name,
  pixelData = {},
  capiData = {},
  searchTerm = null,
  eventId,
  eventTime,
  skipPixel = false,
  initialBrowserEventAlreadySent = false,
}) {
  const useInitialBrowserPageView =
    name === "PageView"
    && typeof window !== "undefined"
    && window.__bricInitialPageViewSent === true;
  const initialPageViewEventId =
    useInitialBrowserPageView
    && typeof window.__bricInitialPageViewEventId === "string"
      ? window.__bricInitialPageViewEventId
      : null;
  const resolvedEventId = initialPageViewEventId || eventId || uuidv4();
  const resolvedEventTime = eventTime || Math.floor(Date.now() / 1000);
  let pixelInvoked = false;

  if (initialBrowserEventAlreadySent || useInitialBrowserPageView) {
    pixelInvoked = true;
    if (useInitialBrowserPageView) {
      window.__bricInitialPageViewSent = false;
      window.__bricInitialPageViewEventId = null;
    }
  } else if (!skipPixel && await waitForFbq()) {
    pixelInvoked = true;
    const hasPixelData = Object.keys(pixelData ?? {}).length > 0;
    window.fbq(
      "track",
      name,
      hasPixelData ? pixelData : undefined,
      { eventID: resolvedEventId },
    );
  }

  let capiQueued = false;
  let capiStatus = null;
  try {
    const response = await fetch("/api/meta/events", {
      method: "POST",
      keepalive: true,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: resolvedEventId,
        eventName: name,
        occurredAt: new Date(resolvedEventTime * 1000).toISOString(),
        eventSourceUrl: window.location.href,
        visitId: getVisitIdFromCookie(),
        journeyId: getOrCreateJourneyId(),
        sessionId: getOrCreateSessionId(),
        promoCode: new URLSearchParams(window.location.search).get("promo"),
        searchTerm,
        items: (capiData.contents ?? []).flatMap((item) => {
          const id = String(item.id ?? "").trim();
          return /^\d+$/.test(id)
            ? [{ productId: Number.parseInt(id, 10), quantity: item.quantity ?? 1 }]
            : [];
        }),
      }),
    });
    capiStatus = response.status;
    capiQueued = response.ok;
    if (!response.ok) {
      console.error(`Meta ${name} queue failed with HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Meta ${name} queue failed`, error);
  }

  return {
    eventId: resolvedEventId,
    eventTime: resolvedEventTime,
    name,
    pixelInvoked,
    capiQueued,
    capiStatus,
  };
}

function buildMetaAnalyticsMetadata(result) {
  return {
    metaTracking: {
      eventName: result.name,
      eventId: result.eventId,
      eventTime: result.eventTime,
      pixel: { invoked: result.pixelInvoked },
      capi: {
        queued: result.capiQueued,
        status: result.capiStatus,
      },
    },
  };
}

export function handlePageView() {
  const navigationKey = getMetaNavigationKey();
  return runMetaEventOnce(`PageView:${navigationKey}`, async () => {
    const result = await trackFacebookEvent({
      name: "PageView",
      pixelData: {},
      capiData: {},
    });
    void trackAnalyticsEvent({
      eventId: result.eventId,
      eventName: "page_view",
      gaEventName: "page_view",
      occurredAt: new Date(result.eventTime * 1000).toISOString(),
      pagePath: `${window.location.pathname}${window.location.search}`,
      metadata: {
        title: document.title,
        isEntry: window.history.length <= 1,
        ...buildMetaAnalyticsMetadata(result),
      },
    });
    return result;
  }, { windowMs: Number.POSITIVE_INFINITY });
}

export function handleViewProduct({ product }) {
  const analyticsItem = buildItemArray([product])[0];
  const data = buildMetaCommerceData([product], Number(product.price ?? 0));
  const navigationKey = getMetaNavigationKey();
  const productId = getMetaContentId(product) ?? "unknown";
  return runMetaEventOnce(`ViewContent:${navigationKey}:${productId}`, async () => {
    const initial = consumeInitialViewContentEvent(product);
    const result = await trackFacebookEvent({
      name: "ViewContent",
      pixelData: data,
      capiData: data,
      eventId: initial?.eventId,
      initialBrowserEventAlreadySent: initial?.browserEventSent === true,
    });
    void trackAnalyticsEvent({
      eventId: result.eventId,
      eventName: "view_item",
      gaEventName: "view_item",
      occurredAt: new Date(result.eventTime * 1000).toISOString(),
      pageType: "product_detail",
      productId: analyticsItem.productId ?? null,
      productSlug: analyticsItem.productSlug ?? null,
      categoryId: analyticsItem.categoryId ?? null,
      categorySlug: analyticsItem.categorySlug ?? null,
      brandId: analyticsItem.brandId ?? null,
      brandSlug: analyticsItem.brandSlug ?? null,
      value: Number(product.price ?? 0),
      metadata: {
        items: [analyticsItem],
        ...buildMetaAnalyticsMetadata(result),
      },
      gaParams: {
        currency: "DZD",
        value: Number(product.price ?? 0),
        items: [analyticsItem],
      },
    });
    return result;
  }, { windowMs: Number.POSITIVE_INFINITY });
}

export async function handleAddToCart({ product }) {
  const analyticsProduct = { ...product, quantity: getQuantity(product) };
  const analyticsItem = {
    ...buildItemArray([analyticsProduct])[0],
    quantity: analyticsProduct.quantity,
  };
  const value = Number(product.price ?? 0) * analyticsProduct.quantity;
  const data = buildMetaCommerceData([analyticsProduct], value);
  const result = await trackFacebookEvent({
    name: "AddToCart",
    pixelData: data,
    capiData: data,
  });
  void trackAnalyticsEvent({
    eventId: result.eventId,
    eventName: "add_to_cart",
    gaEventName: "add_to_cart",
    occurredAt: new Date(result.eventTime * 1000).toISOString(),
    productId: analyticsItem.productId ?? null,
    productSlug: analyticsItem.productSlug ?? null,
    categoryId: analyticsItem.categoryId ?? null,
    categorySlug: analyticsItem.categorySlug ?? null,
    brandId: analyticsItem.brandId ?? null,
    brandSlug: analyticsItem.brandSlug ?? null,
    quantity: analyticsProduct.quantity,
    value,
    metadata: {
      items: [analyticsItem],
      ...buildMetaAnalyticsMetadata(result),
    },
    gaParams: { currency: "DZD", value, items: [analyticsItem] },
  });
  return result;
}

export async function handleInitiateCheckout({ products, totalValue }) {
  const analyticsItems = buildItemArray(products).map((item, index) => ({
    ...item,
    quantity: getQuantity(products[index]),
  }));
  const data = buildMetaCommerceData(products, totalValue);
  const result = await trackFacebookEvent({
    name: "InitiateCheckout",
    pixelData: data,
    capiData: data,
  });
  void trackAnalyticsEvent({
    eventId: result.eventId,
    eventName: "begin_checkout",
    gaEventName: "begin_checkout",
    occurredAt: new Date(result.eventTime * 1000).toISOString(),
    quantity: products.reduce((sum, product) => sum + getQuantity(product), 0),
    value: totalValue,
    metadata: {
      items: analyticsItems,
      ...buildMetaAnalyticsMetadata(result),
    },
    gaParams: { currency: "DZD", value: totalValue, items: analyticsItems },
  });
  return result;
}

export async function handleSearch(searchTerm) {
  const normalizedTerm = typeof searchTerm === "string"
    ? searchTerm.trim().replace(/\s+/g, " ")
    : "";
  if (normalizedTerm.length < 2) return null;

  const result = await trackFacebookEvent({
    name: "Search",
    pixelData: { search_string: normalizedTerm },
    searchTerm: normalizedTerm,
  });
  void trackAnalyticsEvent({
    eventId: result.eventId,
    eventName: "search",
    gaEventName: "search",
    occurredAt: new Date(result.eventTime * 1000).toISOString(),
    searchTerm: normalizedTerm,
    pagePath: `${window.location.pathname}${window.location.search}`,
    metadata: {
      query: normalizedTerm,
      ...buildMetaAnalyticsMetadata(result),
    },
    gaParams: {
      search_term: normalizedTerm,
    },
  });
  return result;
}

export async function handlePurchase(meta, options = {}) {
  if (!meta || meta.eventName !== "Purchase") return null;
  const pixelData = {
    content_ids: meta.contents.map((item) => item.id),
    contents: meta.contents,
    content_type: "product",
    currency: meta.currency,
    value: meta.value,
    ...(options.orderId ? { order_id: String(options.orderId) } : {}),
  };
  let pixelInvoked = false;
  if (await waitForFbq()) {
    pixelInvoked = true;
    window.fbq("track", "Purchase", pixelData, { eventID: meta.eventId });
  }
  void trackAnalyticsEvent({
    eventId: meta.eventId,
    eventName: "purchase",
    gaEventName: "purchase",
    pageType: "checkout",
    orderId: options.orderId ?? null,
    quantity: meta.contents.reduce((sum, item) => sum + item.quantity, 0),
    value: meta.value,
    currency: meta.currency,
    metadata: {
      items: meta.contents.map((item) => ({
        productId: Number(item.id),
        quantity: item.quantity,
        price: item.item_price,
      })),
      ...(options.metadata ?? {}),
      metaTracking: {
        eventName: "Purchase",
        eventId: meta.eventId,
        pixel: { invoked: pixelInvoked },
        capi: { queued: true },
      },
    },
  });
  return {
    eventId: meta.eventId,
    name: "Purchase",
    pixelInvoked,
    capiQueued: true,
  };
}
