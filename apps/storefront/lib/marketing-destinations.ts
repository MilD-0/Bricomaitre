'use client';

import type { StorefrontAnalyticsPayload } from '@/lib/analytics';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[][];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window['fbq'];
  }
}

const invokedEvents = new Set<string>();
let prepared = false;

type MarketingDestinationConfig = {
  metaPixelId?: string | null;
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

export function prepareMarketingDestinations(config: MarketingDestinationConfig = {}) {
  if (typeof window === 'undefined') return false;
  if (prepared) return true;
  const metaId =
    config.metaPixelId === undefined
      ? process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim()
      : config.metaPixelId?.trim();
  try {
    if (metaId) initializeMeta(metaId);
    prepared = true;
    return true;
  } catch {
    return false;
  }
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

export function deliverClientMarketingEvent(payload: StorefrontAnalyticsPayload) {
  const ready = prepareMarketingDestinations();
  const meta = mapMetaEvent(payload);
  let invoked = false;
  if (ready && meta && window.fbq) {
    try {
      if (!invokedEvents.has(payload.eventId)) {
        window.fbq('track', meta.name, meta.params, { eventID: payload.eventId });
        invokedEvents.add(payload.eventId);
      }
      invoked = true;
    } catch {
      // A blocked Pixel must not interrupt first-party analytics or mark the event sent.
    }
  }
  return { meta: { eventName: meta?.name ?? null, invoked } };
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
