import { z } from 'zod';
import { MetaAdsSyncError, readMetaAdsConfig } from './config';
import { type FetchLike, type MetaRequestResult } from './contract';
import { finiteNumber } from './mapping';

export function metaMoney(value: string | number | undefined) {
  if (value == null) return null;
  return (finiteNumber(value) / 100).toFixed(2);
}

export function metaTimestamp(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeJsonHeader(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function responseUsage(response: Response) {
  return {
    app: safeJsonHeader(response.headers.get('x-app-usage')),
    business: safeJsonHeader(response.headers.get('x-business-use-case-usage')),
  };
}

export async function metaRequest<T>(
  url: URL,
  config: ReturnType<typeof readMetaAdsConfig>,
  fetchImpl: FetchLike,
  wait: (milliseconds: number) => Promise<void>,
  schema: z.ZodType<T>,
  responseName: string,
): Promise<MetaRequestResult<T>> {
  if (url.origin !== config.graphApiOrigin) {
    throw new MetaAdsSyncError(
      'Meta returned an invalid pagination URL.',
      'invalid_pagination_url',
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt < 2) {
        await wait(attempt === 0 ? 500 : 2_000);
        continue;
      }
      throw new MetaAdsSyncError(
        error instanceof Error ? error.message.slice(0, 1000) : 'Meta Ads network request failed.',
        'meta_ads_network_error',
      );
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: number; message?: string };
    } | null;

    if (response.ok) {
      let parsed: ReturnType<typeof schema.safeParse> | null = null;
      try {
        parsed = schema.safeParse(body);
      } catch {
        // Treat parser exhaustion from an unexpectedly large or malformed
        // provider response like any other invalid upstream payload.
      }
      if (parsed?.success) {
        return { body: parsed.data, usage: responseUsage(response) };
      }
      if (attempt < 2) {
        await wait(attempt === 0 ? 500 : 2_000);
        continue;
      }
      throw new MetaAdsSyncError(
        `Meta returned an invalid ${responseName} response.`,
        'meta_ads_invalid_response',
        response.status,
      );
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      const delay = Number.isFinite(retryAfterSeconds)
        ? Math.min(10_000, Math.max(0, retryAfterSeconds * 1_000))
        : attempt === 0
          ? 500
          : 2_000;
      await wait(delay);
      continue;
    }

    const code = body?.error?.code == null ? `http_${response.status}` : `meta_${body.error.code}`;
    throw new MetaAdsSyncError(
      body?.error?.message?.slice(0, 1000) || `Meta Ads request failed with ${response.status}.`,
      code,
      response.status,
    );
  }
  throw new MetaAdsSyncError('Meta Ads request exhausted retries.', 'meta_ads_retry_exhausted');
}
