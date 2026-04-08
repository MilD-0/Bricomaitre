import { getPool, hasDb } from '../db/client';

import { getAdminEnvHealth } from './env-health';
import { getStorefrontApiBaseUrl } from './storefront-api';

type DependencyCheck = {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

const DEPENDENCY_TIMEOUT_MS = 1_500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runDependencyCheck(options: {
  configured: boolean;
  label: string;
  execute: () => Promise<unknown>;
}): Promise<DependencyCheck> {
  if (!options.configured) {
    return { configured: false, ok: false, latencyMs: null, error: `${options.label} is not configured` };
  }

  const startedAt = performance.now();

  try {
    await withTimeout(options.execute(), DEPENDENCY_TIMEOUT_MS, options.label);
    return {
      configured: true,
      ok: true,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      error: error instanceof Error ? error.message : `Unknown ${options.label} error`,
    };
  }
}

async function getStorefrontUpstreamHealth(baseUrl: string) {
  const startedAt = performance.now();
  const requestId = globalThis.crypto?.randomUUID?.() ?? `health_${Date.now()}`;

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });

    return {
      configured: true,
      ok: response.ok,
      status: response.status,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      baseUrl,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: null,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      baseUrl,
      error: error instanceof Error ? error.message : 'Unknown storefront upstream error',
    };
  }
}

export async function getAdminHealth() {
  const env = getAdminEnvHealth();
  const [database, storefrontApi] = await Promise.all([
    runDependencyCheck({
      configured: env.checks.databaseConfigured && hasDb(),
      label: 'database',
      execute: async () => {
        await getPool().query('select 1');
      },
    }),
    getStorefrontUpstreamHealth(getStorefrontApiBaseUrl()),
  ]);

  return {
    ok: env.ok && database.ok && storefrontApi.ok,
    missingEnv: env.missing,
    checks: {
      env: env.checks,
      database,
      storefrontApi,
    },
  };
}
