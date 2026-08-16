export type HealthPayload = {
  status: 'ok';
  app: 'storefront';
};

export function buildHealthPayload(): HealthPayload {
  return {
    status: 'ok',
    app: 'storefront',
  };
}
