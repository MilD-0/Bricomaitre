const ADMIN_REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXTAUTH_SECRET',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_CLOUDFRONT_DOMAIN',
] as const;

export function getMissingAdminEnvVars(env: NodeJS.ProcessEnv = process.env) {
  return ADMIN_REQUIRED_ENV_VARS.filter((key) => !env[key]?.trim());
}

export function getAdminEnvHealth(env: NodeJS.ProcessEnv = process.env) {
  const missing = getMissingAdminEnvVars(env);

  return {
    ok: missing.length === 0,
    missing,
    checks: {
      databaseConfigured: Boolean(env.DATABASE_URL?.trim()),
      authConfigured: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.NEXTAUTH_SECRET?.trim()),
      uploadsConfigured: Boolean(env.AWS_REGION?.trim() && env.AWS_S3_BUCKET?.trim() && env.AWS_CLOUDFRONT_DOMAIN?.trim()),
    },
  };
}
