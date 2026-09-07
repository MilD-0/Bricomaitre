import { z } from 'zod';
import { normalizeAlgerianPhoneNumber } from '@bric/storefront-core/settings';

import { requestEcotrack as requestSharedEcotrack } from '@bric/storefront-core/ecotrack-client';

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

export {
  buildEcotrackResultMessage,
  readEcotrackMessage,
  readEcotrackSuccess,
} from '@bric/storefront-core/ecotrack-client';

export function normalizeEcotrackText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEcotrackPhone(value: string | null | undefined) {
  const digits = normalizeAlgerianPhoneNumber(String(value ?? ''));
  if (!digits) return '';
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  return digits;
}

export function readEcotrackTracking(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).tracking;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export { requestSharedEcotrack as requestEcotrack };

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
