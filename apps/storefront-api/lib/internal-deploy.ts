export function getStorefrontApiDeployToken(env: NodeJS.ProcessEnv = process.env) {
  return env.STOREFRONT_API_DEPLOY_TOKEN?.trim() ?? '';
}

export function isValidDeployToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const expected = getStorefrontApiDeployToken(env);

  return expected.length > 0 && token === expected;
}
