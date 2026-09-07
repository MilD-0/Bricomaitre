export const storefrontOrigin = process.env.STOREFRONT_ORIGIN ?? 'http://127.0.0.1:3003';

export const fixtureApiOrigin = process.env.FIXTURE_API_ORIGIN ?? 'http://127.0.0.1:4311';

export const fixtureApiPort = Number(process.env.PORT ?? new URL(fixtureApiOrigin).port);

if (!Number.isSafeInteger(fixtureApiPort) || fixtureApiPort < 1) {
  throw new Error('PORT must be a positive integer.');
}
