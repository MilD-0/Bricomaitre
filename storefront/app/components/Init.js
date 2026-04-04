// lib/tracking-events.js
import { v4 as uuidv4 } from "uuid";
import {
  buildItemArray,
  trackAnalyticsEvent,
} from "@/lib/analytics";

// -------------------- Helpers --------------------
function getCookie(name) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
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
}export async function handlePageView() {
  // Fire on every page load to ensure fbclid is captured
  // The server SDK will generate _fbc/_fbp cookies from the URL
  return trackFacebookEvent({
    name: "PageView",
    pixelData: {},
    capiData: {},
    skipStorage: true, // Don't store PageView events
  });
}

// -------------------- External ID --------------------
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

// -------------------- User Data Builder --------------------
// Send RAW data - server will hash using Meta's SDK
function buildFacebookUserData() {
  const storage = getUserDataFromStorage();
  const userData = {};

  // Send raw values - server handles normalization & hashing
  if (storage.email) userData.em = storage.email;
  if (storage.firstName) userData.fn = storage.firstName;
  if (storage.lastName) userData.ln = storage.lastName;
  if (storage.phoneNumber1) userData.ph = storage.phoneNumber1; // Raw phone
  if (storage.city) userData.ct = storage.city;
  if (storage.state) userData.st = storage.state;
  if (storage.zipCode) userData.zp = storage.zipCode;

  userData.country = "dz";

  const extId = getOrCreateExternalId();
  if (extId) userData.external_id = extId;

  // Include existing cookies - server SDK will validate/regenerate
  const fbp = getCookie("_fbp");
  const fbc = getCookie("_fbc");
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return userData;
}

// -------------------- Core Tracking --------------------
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

  const hasPixelData =
    pixelData && typeof pixelData === "object" && Object.keys(pixelData).length;

  if (!skipPixel && typeof window !== "undefined" && window.fbq) {
    // PageView commonly has no params; still fire it.
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

  try {
    await fetch("/api/capi", {
      method: "POST",
      keepalive: true,
      credentials: "include", // Important: include cookies
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: name,
        event_time: ev_time,
        event_id: ev_id,
        user_data: mergedUserData,
        custom_data: capiData,
        action_source: "website",
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    });
  } catch (err) {
    console.error(`CAPI ${name} failed:`, err);
  }

  const result = { eventId: ev_id, eventTime: ev_time, name, capiData };

  if (!skipStorage && Object.keys(additionalUserData).length === 0) {
    const pastEvents = JSON.parse(sessionStorage.getItem("pastEvents") || "[]");
    pastEvents.push(result);
    sessionStorage.setItem("pastEvents", JSON.stringify(pastEvents));
  }

  return result;
}

// -------------------- Event Helpers (unchanged) --------------------
export async function handleViewProduct({ product, additionalUserData = {} }) {
  const analyticsItem = buildItemArray([product])[0];
  void trackAnalyticsEvent({
    eventName: "view_item",
    gaEventName: "view_item",
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
    },
    gaParams: {
      currency: "DZD",
      value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
      items: [analyticsItem],
    },
  });

  const content_ids = [product._id];
  const contents = [{ id: product._id, quantity: 1, item_price: product.price }];
  const data = {
    content_ids,
    contents,
    content_type: "product",
    value: product.price,
    currency: "DZD",
  };
  return trackFacebookEvent({
    name: "ViewContent",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });
}

export async function handleAddToCart({ product, additionalUserData = {} }) {
  const analyticsItem = buildItemArray([product])[0];
  void trackAnalyticsEvent({
    eventName: "add_to_cart",
    gaEventName: "add_to_cart",
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
    },
    gaParams: {
      currency: "DZD",
      value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
      items: [analyticsItem],
    },
  });

  const content_ids = [product._id];
  const contents = [{ id: product._id, quantity: 1, item_price: product.price }];
  const data = {
    content_ids,
    contents,
    content_type: "product",
    value: product.price,
    currency: "DZD",
  };
  return trackFacebookEvent({
    name: "AddToCart",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });
}

export async function handleInitiateCheckout({
  products,
  totalValue,
  additionalUserData = {},
}) {
  const analyticsItems = buildItemArray(products);
  void trackAnalyticsEvent({
    eventName: "begin_checkout",
    gaEventName: "begin_checkout",
    quantity: products.length,
    value: totalValue,
    metadata: {
      items: analyticsItems,
    },
    gaParams: {
      currency: "DZD",
      value: totalValue,
      items: analyticsItems,
    },
  });

  const content_ids = products.map((p) => p._id);
  const contents = products.map((p) => ({
    id: p._id,
    quantity: 1,
    item_price: p.price,
  }));
  const data = {
    content_ids,
    contents,
    content_type: "product",
    value: totalValue,
    currency: "DZD",
  };
  return trackFacebookEvent({
    name: "InitiateCheckout",
    pixelData: data,
    capiData: data,
    additionalUserData,
  });
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
  void trackAnalyticsEvent({
    eventName: "purchase",
    gaEventName: "purchase",
    orderId: orderId ?? null,
    quantity: products.length,
    value: totalValue,
    metadata: {
      items: analyticsItems,
    },
    gaParams: {
      transaction_id: orderId ? String(orderId) : eventId,
      currency: "DZD",
      value: totalValue,
      items: analyticsItems,
    },
  });

  const content_ids = products.map((p) => p._id);
  const contents = products.map((p) => ({
    id: p._id,
    quantity: 1,
    item_price: p.price,
  }));
  const data = {
    content_ids,
    contents,
    content_type: "product",
    value: totalValue,
    currency: "DZD",
  };
  return trackFacebookEvent({
    name: "Purchase",
    pixelData: data,
    capiData: data,
    additionalUserData,
    eventId,
    eventTime,
  });
}

// -------------------- Enrichment --------------------
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
