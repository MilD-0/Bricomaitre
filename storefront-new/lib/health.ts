export type HealthPayload = {
  status: "ok";
  app: "storefront-new";
};

export function buildHealthPayload(): HealthPayload {
  return {
    status: "ok",
    app: "storefront-new"
  };
}
