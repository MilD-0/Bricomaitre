import { getPool, hasDb } from '@bric/db/client';
import { getRedis } from '@bric/runtime/redis';

import { getStorefrontApiEnvHealth } from './env-health';

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

export async function getStorefrontApiHealth() {
  const env = getStorefrontApiEnvHealth();

  const [database, redis] = await Promise.all([
    runDependencyCheck({
      configured: env.checks.databaseConfigured && hasDb(),
      label: 'database',
      execute: async () => {
        await getPool().query('select 1');
      },
    }),
    runDependencyCheck({
      configured: env.checks.redisConfigured,
      label: 'redis',
      execute: async () => {
        await getRedis().ping();
      },
    }),
  ]);

  return {
    ok: env.ok && database.ok && redis.ok,
    missingEnv: env.missing,
    checks: {
      ...env.checks,
      database,
      redis,
    },
  };
}
