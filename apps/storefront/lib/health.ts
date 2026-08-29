import { fetchStorefrontUpstream } from './storefront-upstream';

export type HealthPayload = {
  status: 'ok' | 'degraded';
  app: 'storefront';
};

export async function getStorefrontHealth() {
  const startedAt = performance.now();

  try {
    const response = await fetchStorefrontUpstream('/api/health', {
      cache: 'no-store',
      timeoutMs: 2_000,
    });

    return {
      ok: response.ok,
      upstream: {
        ok: response.ok,
        status: response.status,
        latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      },
    };
  } catch (error) {
    return {
      ok: false,
      upstream: {
        ok: false,
        status: null,
        latencyMs: Number((performance.now() - startedAt).toFixed(1)),
        error: error instanceof Error ? error.message : 'Unknown storefront API error',
      },
    };
  }
}

export function buildHealthPayload(ok: boolean): HealthPayload {
  return {
    status: ok ? 'ok' : 'degraded',
    app: 'storefront',
  };
}
