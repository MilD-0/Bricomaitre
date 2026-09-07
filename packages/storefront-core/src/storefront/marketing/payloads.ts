import { hashMetaValue, normalizeAlgeriaPhone, type MetaCommerceLine } from '../meta';
import { type Destination, type MarketingEnvironment } from './contract';

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function isMarketingDestinationConfigured(
  destination: Destination,
  env: MarketingEnvironment = process.env as MarketingEnvironment,
) {
  if (destination === 'google') {
    return (
      configured(env.GOOGLE_ANALYTICS_MEASUREMENT_ID ?? env.NEXT_PUBLIC_GA_MEASUREMENT_ID) &&
      configured(env.GOOGLE_ANALYTICS_API_SECRET)
    );
  }

  return (
    configured(env.TIKTOK_PIXEL_ID ?? env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) &&
    configured(env.TIKTOK_EVENTS_API_ACCESS_TOKEN)
  );
}

export function normalizeIdentifier(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 250) : null;
}

function commerceValue(lines: MetaCommerceLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
}

function googleItems(lines: MetaCommerceLine[]) {
  return lines.map((line) => ({
    item_id: line.contentId,
    item_name: line.title.slice(0, 100),
    price: line.effectiveUnitPrice,
    quantity: line.quantity,
  }));
}

function tiktokContents(lines: MetaCommerceLine[]) {
  return lines.map((line) => ({
    content_id: line.contentId,
    content_name: line.title.slice(0, 100),
    content_type: 'product',
    price: line.effectiveUnitPrice,
    quantity: line.quantity,
  }));
}

export function buildGoogleMeasurementPayload(input: {
  eventName: string;
  eventId: string;
  orderId: number;
  eventTime: Date;
  clientId: string;
  sessionId?: string | null;
  lines: MetaCommerceLine[];
}) {
  return {
    client_id: input.clientId,
    timestamp_micros: input.eventTime.getTime() * 1000,
    events: [
      {
        name: input.eventName,
        params: {
          event_id: input.eventId,
          transaction_id: String(input.orderId),
          currency: 'DZD',
          value: commerceValue(input.lines),
          items: googleItems(input.lines),
          ...(input.sessionId && /^\d+$/.test(input.sessionId)
            ? { session_id: input.sessionId }
            : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

export function buildTikTokEventsPayload(input: {
  eventName: string;
  eventId: string;
  orderId: number;
  eventTime: Date;
  eventSourceUrl: string;
  clickId?: string | null;
  cookieId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  lines: MetaCommerceLine[];
}) {
  const normalizedPhone = normalizeAlgeriaPhone(input.phone);
  const emailHash = hashMetaValue(input.email);
  const phoneHash = normalizedPhone ? hashMetaValue(normalizedPhone) : null;
  const externalIdHash = hashMetaValue(input.externalId);
  const user = {
    ...(normalizeIdentifier(input.clickId) ? { ttclid: normalizeIdentifier(input.clickId) } : {}),
    ...(normalizeIdentifier(input.cookieId) ? { ttp: normalizeIdentifier(input.cookieId) } : {}),
    ...(emailHash ? { email: [emailHash] } : {}),
    ...(phoneHash ? { phone_number: [phoneHash] } : {}),
    ...(externalIdHash ? { external_id: [externalIdHash] } : {}),
  };
  return {
    event_source: 'web',
    data: [
      {
        event: input.eventName,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        context: {
          user,
          page: { url: input.eventSourceUrl },
          ...(input.clientIpAddress?.trim() ? { ip: input.clientIpAddress.trim() } : {}),
          ...(input.clientUserAgent?.trim() ? { user_agent: input.clientUserAgent.trim() } : {}),
        },
        properties: {
          order_id: String(input.orderId),
          currency: 'DZD',
          value: commerceValue(input.lines),
          content_type: 'product',
          contents: tiktokContents(input.lines),
        },
      },
    ],
  };
}
