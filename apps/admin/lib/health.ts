import { getPool, hasDb } from '@bric/db/client';
import { runDependencyCheck } from '@bric/runtime/health';

import { getAdminEnvHealth } from './env-health';
import { getStorefrontApiBaseUrl } from './storefront-api';

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
