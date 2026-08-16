const ADMIN_REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_CLOUDFRONT_DOMAIN',
  'STOREFRONT_REVALIDATE_SECRET',
] as const;

function getMissingAdminEnvVars(env: NodeJS.ProcessEnv = process.env) {
  return ADMIN_REQUIRED_ENV_VARS.filter((key) => !env[key]?.trim());
}

export function getAdminEnvHealth(env: NodeJS.ProcessEnv = process.env) {
  const missing = getMissingAdminEnvVars(env);

  return {
    ok: missing.length === 0,
    missing,
    checks: {
      databaseConfigured: Boolean(env.DATABASE_URL?.trim()),
      authConfigured: Boolean(
        env.GOOGLE_CLIENT_ID?.trim() &&
        env.GOOGLE_CLIENT_SECRET?.trim() &&
        env.BETTER_AUTH_SECRET?.trim() &&
        env.BETTER_AUTH_URL?.trim(),
      ),
      uploadsConfigured: Boolean(
        env.AWS_REGION?.trim() && env.AWS_S3_BUCKET?.trim() && env.AWS_CLOUDFRONT_DOMAIN?.trim(),
      ),
      storefrontRevalidationConfigured: Boolean(env.STOREFRONT_REVALIDATE_SECRET?.trim()),
    },
  };
}
