import { getPool, hasDb } from '@bric/db/client';
import { runDependencyCheck } from '@bric/runtime/health';
import { getRedis } from '@bric/runtime/redis';

import { getStorefrontApiEnvHealth } from './env-health';

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
