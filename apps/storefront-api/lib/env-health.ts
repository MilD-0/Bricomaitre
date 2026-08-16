const STOREFRONT_API_REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'ECOTRACK_BASE_URL',
  'ECOTRACK_TOKEN',
  'STOREFRONT_REVALIDATE_SECRET',
] as const;

function getMissingStorefrontApiEnvVars(env: NodeJS.ProcessEnv = process.env) {
  const hasRedisUrl = Boolean(env.REDIS_URL?.trim());

  return STOREFRONT_API_REQUIRED_ENV_VARS.filter((key) => {
    if (key === 'REDIS_HOST' && hasRedisUrl) {
      return false;
    }

    return !env[key]?.trim();
  });
}

export function getStorefrontApiEnvHealth(env: NodeJS.ProcessEnv = process.env) {
  const missing = getMissingStorefrontApiEnvVars(env);

  return {
    ok: missing.length === 0,
    missing,
    checks: {
      databaseConfigured: Boolean(env.DATABASE_URL?.trim()),
      redisConfigured: Boolean(env.REDIS_URL?.trim() || env.REDIS_HOST?.trim()),
      ecotrackConfigured: Boolean(env.ECOTRACK_BASE_URL?.trim() && env.ECOTRACK_TOKEN?.trim()),
      revalidationConfigured: Boolean(env.STOREFRONT_REVALIDATE_SECRET?.trim()),
    },
  };
}
