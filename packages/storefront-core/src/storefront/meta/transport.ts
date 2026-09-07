import { type MetaOutboxRow, type MetaSendResult } from './contract';

function getMetaCredentials() {
  const pixelId =
    process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim() || '';
  const token =
    process.env.META_CONVERSIONS_API_TOKEN?.trim() ||
    process.env.FACEBOOK_ACCESS_TOKEN?.trim() ||
    '';
  const configuredVersion = process.env.META_GRAPH_API_VERSION?.trim() || 'v25.0';
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : 'v25.0';
  const graphApiOrigin = (
    process.env.META_GRAPH_API_ORIGIN?.trim() || 'https://graph.facebook.com'
  ).replace(/\/+$/, '');
  return { pixelId, token, graphVersion, graphApiOrigin };
}

function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export async function sendMetaEvent(
  event: Pick<
    MetaOutboxRow,
    'eventName' | 'eventId' | 'eventTime' | 'eventSourceUrl' | 'userData' | 'customData'
  >,
  options?: { testEventCode?: string | null },
): Promise<MetaSendResult> {
  const { pixelId, token, graphVersion, graphApiOrigin } = getMetaCredentials();
  if (!pixelId || !token) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      subcode: null,
      message: 'Missing Meta pixel credentials.',
      fbtraceId: null,
    };
  }
  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(event.eventTime.getTime() / 1000),
        event_id: event.eventId,
        action_source: 'website',
        event_source_url: event.eventSourceUrl,
        user_data: event.userData,
        custom_data: event.customData,
      },
    ],
    ...(options?.testEventCode ? { test_event_code: options.testEventCode } : {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${graphApiOrigin}/${graphVersion}/${encodeURIComponent(pixelId)}/events`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      events_received?: unknown;
      fbtrace_id?: unknown;
      error?: {
        message?: unknown;
        code?: unknown;
        error_subcode?: unknown;
        fbtrace_id?: unknown;
      };
    };
    const eventsReceived = typeof body.events_received === 'number' ? body.events_received : 0;
    const fbtraceId =
      typeof body.fbtrace_id === 'string'
        ? body.fbtrace_id
        : typeof body.error?.fbtrace_id === 'string'
          ? body.error.fbtrace_id
          : null;
    if (response.ok && eventsReceived >= 1) {
      return { ok: true, status: response.status, eventsReceived, fbtraceId };
    }
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    return {
      ok: false,
      retryable,
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      code: typeof body.error?.code === 'number' ? body.error.code : null,
      subcode: typeof body.error?.error_subcode === 'number' ? body.error.error_subcode : null,
      message:
        typeof body.error?.message === 'string'
          ? body.error.message
          : response.ok
            ? 'Meta returned events_received < 1.'
            : `Meta API returned HTTP ${response.status}.`,
      fbtraceId,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      subcode: null,
      message: error instanceof Error ? error.message : String(error),
      fbtraceId: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
