// lib/tracking-events.js
import { v4 as uuidv4 } from "uuid";
import {
  buildItemArray,
  trackAnalyticsEvent,
} from "@/lib/analytics";

const BRIC_FBCLID_COOKIE = "_bric_fbclid";
const FBC_COOKIE = "_fbc";
const FBC_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

function setCookie(name, value, maxAgeSeconds = FBC_MAX_AGE_SECONDS) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function buildFbcValue(fbclid) {
  return `fb.1.${Date.now()}.${fbclid}`;
}

export function captureFbclidFromLocation() {
  if (typeof window === "undefined") return null;

  const fbclid = new URLSearchParams(window.location.search).get("fbclid")?.trim();
  if (!fbclid) {
    return getCookie(BRIC_FBCLID_COOKIE);
  }

  setCookie(BRIC_FBCLID_COOKIE, fbclid);
  setCookie(FBC_COOKIE, buildFbcValue(fbclid));
  return fbclid;
}

function getUserDataFromStorage() {
  if (typeof window === "undefined") return {};
  const s = window.localStorage;
  if (!s) return {};
  return {
    email: s.getItem("email") || "",
    firstName: s.getItem("firstName") || "",
    lastName: s.getItem("lastName") || "",
    state: s.getItem("state") || "",
    city: s.getItem("city") || "",
    country:"dz",
    zipCode: s.getItem("zipCode") || "",
    homeAddress: s.getItem("homeAddress") || "",
    phoneNumber1: s.getItem("phoneNumber1") || "",
  };
}

export async function handlePageView() {
  const metaResult = await trackFacebookEvent({
    name: "PageView",
    pixelData: {},
    capiData: {},
    skipStorage: true,
  });

  void trackAnalyticsEvent({
    eventId: metaResult.eventId,
    eventName: "page_view",
    gaEventName: "page_view",
    occurredAt: new Date(metaResult.eventTime * 1000).toISOString(),
    metadata: buildMetaAnalyticsMetadata(metaResult, {}, {}),
  });

  return metaResult;
}

export function getOrCreateExternalId() {
  if (typeof window === "undefined") return null;

  const STORAGE_KEY = "_ext_id";
  let extId = localStorage.getItem(STORAGE_KEY);

  if (!extId) {
    extId = `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(STORAGE_KEY, extId);
  }

  return extId;
}

function buildFacebookUserData() {
  captureFbclidFromLocation();
  const storage = getUserDataFromStorage();
  const userData = {};

  if (storage.email) userData.em = storage.email;
  if (storage.firstName) userData.fn = storage.firstName;
  if (storage.lastName) userData.ln = storage.lastName;
  if (storage.phoneNumber1) userData.ph = storage.phoneNumber1;
  if (storage.city) userData.ct = storage.city;
  if (storage.state) userData.st = storage.state;
  if (storage.zipCode) userData.zp = storage.zipCode;

  userData.country = "dz";

  const extId = getOrCreateExternalId();
  if (extId) userData.external_id = extId;

  const fbp = getCookie("_fbp");
  const fbc = getCookie(FBC_COOKIE);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return userData;
}

function getMetaContentId(product) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const candidates = [product.id, product._id, product.slug];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      continue;
    }

    const value = String(candidate).trim();
    if (value && value !== "undefined" && value !== "null") {
      return value;
    }
  }

  return null;
}

function buildMetaCommerceData(products, value) {
  const contents = (Array.isArray(products) ? products : [])
    .map((product) => {
      const id = getMetaContentId(product);
      if (!id) {
        return null;
      }

      return {
        id,
        quantity:
          typeof product?.quantity === "number" && Number.isFinite(product.quantity)
            ? product.quantity
            : 1,
        item_price:
          typeof product?.price === "number" && Number.isFinite(product.price)
            ? product.price
            : Number(product?.price ?? 0),
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

function waitForFbq(timeoutMs = 3000) {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (typeof window.fbq === "function") {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      if (typeof window.fbq === "function") {
        resolve(true);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

async function trackFacebookEvent({
  name,
  pixelData = {},
  capiData = {},
  additionalUserData = {},
  eventId,
  eventTime,
  skipStorage = false,
  skipPixel = false,
}) {
  const ev_id = eventId || uuidv4();
  const ev_time = eventTime || Math.floor(Date.now() / 1000);
  let metaOk = true;
  let metaStatus = null;
  let pixelFired = false;
  let effectiveCapiPayload = null;

  const hasPixelData =
    pixelData && typeof pixelData === "object" && Object.keys(pixelData).length;

  if (!skipPixel && (await waitForFbq())) {
    pixelFired = true;
    if (hasPixelData) {
      window.fbq("track", name, pixelData, { eventID: ev_id });
    } else {
      window.fbq("track", name, undefined, { eventID: ev_id });
    }
  }

  const storageUserData = buildFacebookUserData();
  const mergedUserData = {
    ...storageUserData,
    ...additionalUserData,
  };
  const fbclid = captureFbclidFromLocation();

  try {
    const response = await fetch("/api/capi", {
      method: "POST",
      keepalive: true,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: name,
        event_time: ev_time,
        event_id: ev_id,
        user_data: mergedUserData,
        custom_data: capiData,
        action_source: "website",
        url: typeof window !== "undefined" ? window.location.href : undefined,
        fbclid: fbclid || undefined,
      }),
    });

    if (!response.ok) {
      metaOk = false;
      metaStatus = response.status;
      const payload = await response.clone().json().catch(() => null);
      effectiveCapiPayload =
        payload && typeof payload === "object" && payload.effectivePayload && typeof payload.effectivePayload === "object"
          ? payload.effectivePayload
          : effectiveCapiPayload;
      const errorText = payload ? JSON.stringify(payload) : await response.text();
      console.error(`CAPI ${name} failed with ${response.status}:`, errorText);
    } else {
      metaStatus = response.status;
      const payload = await response.json().catch(() => null);
      effectiveCapiPayload =
        payload && typeof payload === "object" && payload.effectivePayload && typeof payload.effectivePayload === "object"
          ? payload.effectivePayload
          : effectiveCapiPayload;
    }
  } catch (err) {
    metaOk = false;
    console.error(`CAPI ${name} failed:`, err);
  }

  const pixelPayload = {
    event_name: name,
    event_id: ev_id,
    event_time: ev_time,
    payload: pixelData ?? {},
    options: {
      eventID: ev_id,
    },
  };
  const result = {
    eventId: ev_id,
    eventTime: ev_time,
    name,
    capiData,
    metaOk,
    metaStatus,
    pixelFired,
    pixelPayload,
    capiPayload: effectiveCapiPayload,
  };

  if (!skipStorage && Object.keys(additionalUserData).length === 0) {
    const pastEvents = JSON.parse(sessionStorage.getItem("pastEvents") || "[]");
    pastEvents.push(result);
    sessionStorage.setItem("pastEvents", JSON.stringify(pastEvents));
  }

  return result;
}

function buildMetaAnalyticsMetadata(result, pixelData, capiData) {
  return {
    metaTracking: {
      eventName: result.name,
      eventId: result.eventId,
      eventTime: result.eventTime,
      pixel: {
        fired: result.pixelFired,
        payload: result.pixelPayload ?? pixelData ?? {},
      },
      capi: {
        attempted: true,
        payload: result.capiPayload ?? capiData ?? {},
        ok: result.metaOk,
        status: result.metaStatus,
      },
    },
  };
}

export async function handleViewProduct({ product, additionalUserData = {} }) {
  const analyticsItem = buildItemArray([product])[0];
  const data = buildMetaCommerceData([product], product.price);
  const metaResult = await trackFacebookEvent({
    name: "ViewContent",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });

  void trackAnalyticsEvent({
    eventId: metaResult.eventId,
    eventName: "view_item",
    gaEventName: "view_item",
    occurredAt: new Date(metaResult.eventTime * 1000).toISOString(),
    pageType: "product_detail",
    productId: analyticsItem.productId ?? null,
    productSlug: analyticsItem.productSlug ?? null,
    categoryId: analyticsItem.categoryId ?? null,
    categorySlug: analyticsItem.categorySlug ?? null,
    brandId: analyticsItem.brandId ?? null,
    brandSlug: analyticsItem.brandSlug ?? null,
    value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
    metadata: {
      items: [analyticsItem],
      ...buildMetaAnalyticsMetadata(metaResult, data, data),
    },
    gaParams: {
      currency: "DZD",
      value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
      items: [analyticsItem],
    },
  });

  return metaResult;
}

export async function handleAddToCart({ product, additionalUserData = {} }) {
  const analyticsItem = buildItemArray([product])[0];
  const data = buildMetaCommerceData([product], product.price);
  const metaResult = await trackFacebookEvent({
    name: "AddToCart",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });

  void trackAnalyticsEvent({
    eventId: metaResult.eventId,
    eventName: "add_to_cart",
    gaEventName: "add_to_cart",
    occurredAt: new Date(metaResult.eventTime * 1000).toISOString(),
    productId: analyticsItem.productId ?? null,
    productSlug: analyticsItem.productSlug ?? null,
    categoryId: analyticsItem.categoryId ?? null,
    categorySlug: analyticsItem.categorySlug ?? null,
    brandId: analyticsItem.brandId ?? null,
    brandSlug: analyticsItem.brandSlug ?? null,
    quantity: 1,
    value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
    metadata: {
      items: [analyticsItem],
      ...buildMetaAnalyticsMetadata(metaResult, data, data),
    },
    gaParams: {
      currency: "DZD",
      value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
      items: [analyticsItem],
    },
  });

  return metaResult;
}

export async function handleInitiateCheckout({
  products,
  totalValue,
  additionalUserData = {},
}) {
  const analyticsItems = buildItemArray(products);
  const data = buildMetaCommerceData(products, totalValue);
  const metaResult = await trackFacebookEvent({
    name: "InitiateCheckout",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });

  void trackAnalyticsEvent({
    eventId: metaResult.eventId,
    eventName: "begin_checkout",
    gaEventName: "begin_checkout",
    occurredAt: new Date(metaResult.eventTime * 1000).toISOString(),
    quantity: products.length,
    value: totalValue,
    metadata: {
      items: analyticsItems,
      ...buildMetaAnalyticsMetadata(metaResult, data, data),
    },
    gaParams: {
      currency: "DZD",
      value: totalValue,
      items: analyticsItems,
    },
  });

  return metaResult;
}

export async function handlePurchase({
  products,
  totalValue,
  additionalUserData = {},
  eventId,
  eventTime,
  orderId,
}) {
  const analyticsItems = buildItemArray(products);
  const data = buildMetaCommerceData(products, totalValue);
  const metaResult = await trackFacebookEvent({
    name: "Purchase",
    pixelData: data,
    capiData: data,
    additionalUserData,
    eventId,
    eventTime,
  });

  void trackAnalyticsEvent({
    eventId: metaResult.eventId,
    eventName: "purchase",
    gaEventName: "purchase",
    occurredAt: new Date(metaResult.eventTime * 1000).toISOString(),
    orderId: orderId ?? null,
    quantity: products.length,
    value: totalValue,
    metadata: {
      items: analyticsItems,
      ...buildMetaAnalyticsMetadata(metaResult, data, data),
    },
    gaParams: {
      transaction_id: orderId ? String(orderId) : metaResult.eventId,
      currency: "DZD",
      value: totalValue,
      items: analyticsItems,
    },
  });

  return metaResult;
}

export async function enrichPastEvents() {
  if (typeof window === "undefined") return;
  const pastEvents = JSON.parse(sessionStorage.getItem("pastEvents") || "[]");
  if (!pastEvents.length) return;

  const enrichedUserData = buildFacebookUserData();

  for (const ev of pastEvents) {
    await trackFacebookEvent({
      name: ev.name,
      capiData: ev.capiData || {},
      additionalUserData: enrichedUserData,
      eventId: ev.eventId,
      eventTime: ev.eventTime,
      skipStorage: true,
      skipPixel: true,
    });
  }

  sessionStorage.removeItem("pastEvents");
}
