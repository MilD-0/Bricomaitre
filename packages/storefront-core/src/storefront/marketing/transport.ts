import { type OutboxRow } from './contract';

type SendResult =
  | { ok: true; status: number; requestId: string | null; summary: Record<string, unknown> }
  | {
      ok: false;
      retryable: boolean;
      status: number | null;
      retryAfterMs: number | null;
      code: string | null;
      message: string;
    };

function retryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export async function sendMarketingDestinationEvent(row: OutboxRow): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let url: string;
    let headers: Record<string, string> = { 'content-type': 'application/json' };
    let body = row.payload;
    if (row.destination === 'google') {
      const measurementId =
        process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID?.trim() ||
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
      const apiSecret = process.env.GOOGLE_ANALYTICS_API_SECRET?.trim();
      if (!measurementId || !apiSecret)
        return {
          ok: false,
          retryable: false,
          status: null,
          retryAfterMs: null,
          code: 'destination_unconfigured',
          message: 'Google Analytics Measurement Protocol credentials are not configured.',
        };
      const endpoint =
        process.env.GOOGLE_ANALYTICS_API_ENDPOINT?.trim() ||
        'https://www.google-analytics.com/mp/collect';
      const endpointUrl = new URL(endpoint);
      endpointUrl.searchParams.set('measurement_id', measurementId);
      endpointUrl.searchParams.set('api_secret', apiSecret);
      url = endpointUrl.toString();
    } else if (row.destination === 'tiktok') {
      const pixelId =
        process.env.TIKTOK_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
      const accessToken = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN?.trim();
      if (!pixelId || !accessToken)
        return {
          ok: false,
          retryable: false,
          status: null,
          retryAfterMs: null,
          code: 'destination_unconfigured',
          message: 'TikTok Events API credentials are not configured.',
        };
      url =
        process.env.TIKTOK_EVENTS_API_ENDPOINT?.trim() ||
        'https://business-api.tiktok.com/open_api/v1.3/event/track/';
      headers = { ...headers, 'Access-Token': accessToken };
      body = { ...(row.payload as Record<string, unknown>), event_source_id: pixelId };
    } else {
      return {
        ok: false,
        retryable: false,
        status: null,
        retryAfterMs: null,
        code: 'unknown_destination',
        message: `Unknown destination ${row.destination}.`,
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const tiktokCode =
      row.destination === 'tiktok' && typeof responseBody.code === 'number' ? responseBody.code : 0;
    if (response.ok && tiktokCode === 0) {
      return {
        ok: true,
        status: response.status,
        requestId:
          response.headers.get('x-request-id') ??
          (typeof responseBody.request_id === 'string' ? responseBody.request_id : null),
        summary: row.destination === 'tiktok' ? { code: tiktokCode } : {},
      };
    }
    return {
      ok: false,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      status: response.status,
      retryAfterMs: retryAfter(response.headers.get('retry-after')),
      code:
        typeof responseBody.code === 'string' || typeof responseBody.code === 'number'
          ? String(responseBody.code)
          : null,
      message:
        typeof responseBody.message === 'string'
          ? responseBody.message
          : `${row.destination} returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
