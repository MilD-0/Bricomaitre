'use client';

import type { StorefrontAnalyticsPayload } from '@/lib/analytics';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[][];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window['fbq'];
  }
}

const delivered = new Set<string>();
let prepared = false;

type MarketingDestinationConfig = {
  metaPixelId?: string | null;
  googleMeasurementId?: string | null;
};

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
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
}

export function prepareMarketingDestinations(config: MarketingDestinationConfig = {}) {
  if (prepared || typeof window === 'undefined') return;
  prepared = true;
  const metaId =
    config.metaPixelId === undefined
      ? process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim()
      : config.metaPixelId?.trim();
  const googleId =
    config.googleMeasurementId === undefined
      ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
      : config.googleMeasurementId?.trim();
  if (metaId) initializeMeta(metaId);
  if (googleId) initializeGoogle(googleId);
}

function commerceItems(payload: StorefrontAnalyticsPayload) {
  const metadataItems =
    'items' in payload.metadata && Array.isArray(payload.metadata.items)
      ? payload.metadata.items
      : [];
  if (metadataItems.length > 0) {
    return metadataItems.map((entry) => ({
      productId: entry.productId,
      quantity: entry.quantity,
      price: entry.price,
    }));
  }
  const quantity = payload.quantity ?? 1;
  return payload.productId
    ? [
        {
          productId: payload.productId,
          quantity,
          price: payload.value == null ? undefined : payload.value / quantity,
        },
      ]
    : [];
}

function googleItems(payload: StorefrontAnalyticsPayload) {
  return commerceItems(payload).map((entry) => ({
    item_id: String(entry.productId),
    quantity: entry.quantity,
    price: entry.price,
  }));
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
  const items = googleItems(payload);
  return {
    name,
    params: {
      event_id: payload.eventId,
      page_location: `${window.location.origin}${payload.pagePath ?? window.location.pathname}`,
      currency: payload.currency,
      ...(payload.value != null ? { value: payload.value } : {}),
      ...(payload.searchTerm ? { search_term: payload.searchTerm } : {}),
      ...(payload.orderId ? { transaction_id: String(payload.orderId) } : {}),
      ...(items.length ? { items } : {}),
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
  const items = commerceItems(payload);
  const commerceValue =
    items.length && items.every((entry) => entry.price != null)
      ? items.reduce((total, entry) => total + (entry.price ?? 0) * entry.quantity, 0)
      : payload.value;
  return {
    name,
    params: {
      currency: payload.currency,
      ...(commerceValue != null ? { value: commerceValue } : {}),
      ...(payload.searchTerm ? { search_string: payload.searchTerm } : {}),
      ...(items.length
        ? {
            content_ids: items.map((entry) => String(entry.productId)),
            contents: items.map((entry) => ({
              id: String(entry.productId),
              quantity: entry.quantity,
              item_price: entry.price,
            })),
            content_type: 'product',
          }
        : {}),
      ...(payload.orderId ? { order_id: String(payload.orderId) } : {}),
    },
  };
}

function once(destination: string, eventId: string, send: () => void) {
  const key = `${destination}:${eventId}`;
  if (delivered.has(key)) return true;
  delivered.add(key);
  try {
    send();
    return true;
  } catch {
    return false;
  }
}

export function deliverClientMarketingEvent(payload: StorefrontAnalyticsPayload) {
  prepareMarketingDestinations();
  const google = mapGoogleEvent(payload);
  if (google && window.gtag)
    once('google', payload.eventId, () => window.gtag?.('event', google.name, google.params));
  const meta = mapMetaEvent(payload);
  const metaInvoked = Boolean(
    meta &&
    window.fbq &&
    once('meta', payload.eventId, () =>
      window.fbq?.('track', meta.name, meta.params, { eventID: payload.eventId }),
    ),
  );
  return {
    meta: {
      eventName: meta?.name ?? null,
      invoked: metaInvoked,
    },
  };
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
    items: commerceItems(payload).map((entry) => ({
      productId: entry.productId,
      quantity: entry.quantity,
    })),
  };
}
