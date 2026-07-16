'use client';

import type { StorefrontAnalyticsPayload } from '@/lib/analytics';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string };
    _fbq?: Window['fbq'];
    ttq?: TikTokQueue;
    TiktokAnalyticsObject?: string;
  }
}

type TikTokQueue = unknown[][] & {
  _i?: Record<string, TikTokQueue & { _u?: string }>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
  load?: (id: string, options?: Record<string, unknown>) => void;
  page?: () => void;
  track?: (...args: unknown[]) => void;
};

const delivered = new Set<string>();
let prepared = false;
let loaded = false;

function appendScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function initializeMeta(pixelId: string) {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else (fbq.queue ??= []).push(args);
    } as NonNullable<Window['fbq']>;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }
  window.fbq?.('init', pixelId);
}

function initializeGoogle(measurementId: string) {
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => { window.dataLayer?.push(args); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
}

function initializeTikTok(pixelId: string) {
  window.TiktokAnalyticsObject = 'ttq';
  const ttq = window.ttq ?? ([] as unknown as TikTokQueue);
  const methods = ttq as unknown as Record<string, unknown>;
  for (const method of ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']) {
    if (typeof methods[method] !== 'function') {
      methods[method] = (...args: unknown[]) => { ttq.push([method, ...args]); };
    }
  }
  ttq._i ??= {};
  ttq._t ??= {};
  ttq._o ??= {};
  ttq.load ??= (id: string, options: Record<string, unknown> = {}) => {
    const instance = [] as unknown as TikTokQueue & { _u?: string };
    const source = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`;
    instance._u = source;
    ttq._i![id] = instance;
    ttq._t![id] = Date.now();
    ttq._o![id] = options;
  };
  window.ttq = ttq;
  ttq.load(pixelId);
}

export function prepareMarketingDestinations() {
  if (prepared || typeof window === 'undefined') return;
  prepared = true;
  const metaId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim();
  const googleId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const tiktokId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
  if (metaId) initializeMeta(metaId);
  if (googleId) initializeGoogle(googleId);
  if (tiktokId) initializeTikTok(tiktokId);
}

export function loadMarketingDestinationScripts() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  const metaId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim();
  const googleId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const tiktokId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
  if (metaId) appendScript('bric-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');
  if (googleId) appendScript('bric-google-analytics', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`);
  if (tiktokId) {
    const source = window.ttq?._i?.[tiktokId]?._u
      ?? `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(tiktokId)}&lib=ttq`;
    appendScript('bric-tiktok-pixel', source);
  }
}

function item(payload: StorefrontAnalyticsPayload) {
  return payload.productId ? [{ item_id: String(payload.productId), quantity: payload.quantity ?? 1, price: payload.value ?? undefined }] : [];
}

export function mapGoogleEvent(payload: StorefrontAnalyticsPayload) {
  const names: Partial<Record<StorefrontAnalyticsPayload['eventName'], string>> = {
    page_view: 'page_view',
    view_item: 'view_item',
    view_item_list: 'view_item_list',
    search: 'view_search_results',
    select_item: 'select_item',
    add_to_cart: 'add_to_cart',
    view_cart: 'view_cart',
    begin_checkout: 'begin_checkout',
    purchase: 'purchase',
  };
  const name = names[payload.eventName];
  if (!name) return null;
  return {
    name,
    params: {
      event_id: payload.eventId,
      page_location: `${window.location.origin}${payload.pagePath ?? window.location.pathname}`,
      currency: payload.currency,
      ...(payload.value != null ? { value: payload.value } : {}),
      ...(payload.searchTerm ? { search_term: payload.searchTerm } : {}),
      ...(payload.orderId ? { transaction_id: String(payload.orderId) } : {}),
      ...(item(payload).length ? { items: item(payload) } : {}),
    },
  };
}

export function mapMetaEvent(payload: StorefrontAnalyticsPayload) {
  const names: Partial<Record<StorefrontAnalyticsPayload['eventName'], string>> = {
    page_view: 'PageView',
    view_item: 'ViewContent',
    search: 'Search',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'Purchase',
  };
  const name = names[payload.eventName];
  if (!name) return null;
  return {
    name,
    params: {
      currency: payload.currency,
      ...(payload.value != null ? { value: payload.value } : {}),
      ...(payload.searchTerm ? { search_string: payload.searchTerm } : {}),
      ...(payload.productId ? { content_ids: [String(payload.productId)], content_type: 'product' } : {}),
      ...(payload.orderId ? { order_id: String(payload.orderId) } : {}),
    },
  };
}

export function mapTikTokEvent(payload: StorefrontAnalyticsPayload) {
  const names: Partial<Record<StorefrontAnalyticsPayload['eventName'], string>> = {
    page_view: 'PageView',
    view_item: 'ViewContent',
    search: 'Search',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'CompletePayment',
  };
  const name = names[payload.eventName];
  if (!name) return null;
  return {
    name,
    properties: {
      currency: payload.currency,
      ...(payload.value != null ? { value: payload.value } : {}),
      ...(payload.searchTerm ? { query: payload.searchTerm } : {}),
      ...(payload.productId ? { content_id: String(payload.productId), content_type: 'product', quantity: payload.quantity ?? 1 } : {}),
      ...(payload.orderId ? { order_id: String(payload.orderId) } : {}),
    },
  };
}

function once(destination: string, eventId: string, send: () => void) {
  const key = `${destination}:${eventId}`;
  if (delivered.has(key)) return;
  delivered.add(key);
  try { send(); } catch { /* Destination scripts are optional. */ }
}

export function deliverClientMarketingEvent(payload: StorefrontAnalyticsPayload) {
  prepareMarketingDestinations();
  const google = mapGoogleEvent(payload);
  if (google && window.gtag) once('google', payload.eventId, () => window.gtag?.('event', google.name, google.params));
  const meta = mapMetaEvent(payload);
  if (meta && window.fbq) once('meta', payload.eventId, () => window.fbq?.('track', meta.name, meta.params, { eventID: payload.eventId }));
  const tiktok = mapTikTokEvent(payload);
  if (tiktok && window.ttq?.track) once('tiktok', payload.eventId, () => window.ttq?.track?.(tiktok.name, tiktok.properties, { event_id: payload.eventId }));
}

export function buildMetaServerEvent(payload: StorefrontAnalyticsPayload) {
  const mapped = mapMetaEvent(payload);
  if (!mapped || payload.eventName === 'purchase') return null;
  return {
    eventId: payload.eventId,
    eventName: mapped.name,
    occurredAt: payload.occurredAt,
    eventSourceUrl: window.location.href,
    journeyId: payload.journeyId,
    sessionId: payload.sessionId,
    searchTerm: payload.searchTerm,
    items: payload.productId ? [{ productId: payload.productId, quantity: payload.quantity ?? 1 }] : [],
  };
}
