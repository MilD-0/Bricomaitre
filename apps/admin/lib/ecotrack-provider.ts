import { z } from 'zod';

import {
  EcotrackRateLimitError,
  requestEcotrack as requestSharedEcotrack,
  type EcotrackExtendedRateLimitSnapshot,
  type EcotrackRequestOptions,
  type EcotrackRequestResult,
} from '@bric/storefront-core/ecotrack-client';

export type EcotrackProvider = 'delivro' | 'emir';

export function getEcotrackProviderEnv(
  provider: EcotrackProvider,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (provider === 'delivro') {
    return env;
  }

  return {
    ...env,
    ECOTRACK_BASE_URL: env.ECOTRACK_EMIR_BASE_URL,
    ECOTRACK_TOKEN: env.ECOTRACK_EMIR_TOKEN,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export { cleanEcotrackEnvValue, getEcotrackConfig } from '@bric/storefront-core/ecotrack-client';

export function normalizeEcotrackText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEcotrackPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  return digits;
}

export function readEcotrackSuccess(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const value = (payload as Record<string, unknown>).success;
  return value === true || value === 1 || value === '1';
}

export function readEcotrackMessage(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).message;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readEcotrackErrors(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const value = (payload as Record<string, unknown>).errors;
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  return [];
}

export function readEcotrackTracking(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).tracking;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildEcotrackResultMessage(payload: unknown, fallback: string) {
  const explicitMessage = readEcotrackMessage(payload);
  if (explicitMessage) {
    return explicitMessage;
  }

  const errors = readEcotrackErrors(payload);
  if (errors.length > 0) {
    return errors.join('; ');
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (text) {
      return text;
    }
  }

  return fallback;
}

async function applyEcotrackRateLimitBackoff(rateLimit: EcotrackExtendedRateLimitSnapshot) {
  if (rateLimit.dayRemaining !== null && rateLimit.dayRemaining <= 0) {
    throw new EcotrackRateLimitError('ECOTRACK daily rate limit exhausted.', rateLimit);
  }

  if (rateLimit.hourRemaining !== null && rateLimit.hourRemaining <= 0) {
    throw new EcotrackRateLimitError('ECOTRACK hourly rate limit exhausted.', rateLimit);
  }

  if (rateLimit.retryAfterSeconds !== null && rateLimit.retryAfterSeconds > 0) {
    await sleep(rateLimit.retryAfterSeconds * 1000);
    return;
  }

  if (
    rateLimit.minuteRemaining !== null &&
    rateLimit.minuteRemaining <= 1 &&
    rateLimit.minuteReset !== null
  ) {
    const waitMs = Math.max(rateLimit.minuteReset * 1000 - Date.now(), 0);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}

export async function requestEcotrack(
  options: EcotrackRequestOptions,
): Promise<EcotrackRequestResult> {
  const result = await requestSharedEcotrack({ ...options, respectGlobalLimiter: false });
  await applyEcotrackRateLimitBackoff(result.rateLimit);
  return result;
}

export async function requestEcotrackJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv,
) {
  const result = await requestSharedEcotrack({
    path,
    fetchImpl,
    env,
    accept: 'application/json',
    respectGlobalLimiter: false,
  });
  if (typeof result.payload === 'string') {
    throw new Error(`ECOTRACK request returned invalid JSON for ${path}.`);
  }

  return {
    data: schema.parse(result.payload),
    rateLimit: result.rateLimit,
  };
}
