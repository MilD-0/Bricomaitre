import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("app/api/health/route", () => {
  beforeEach(() => {
    process.env.STOREFRONT_API_BASE_URL = "https://storefront-api.example.com";
    process.env.STOREFRONT_REVALIDATE_SECRET = "secret";
  });

  it("returns ok when storefront-api is reachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 })));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: "ok",
      service: "storefront",
    }));
  });

  it("returns degraded when storefront-api is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: "degraded",
      checks: expect.objectContaining({
        storefrontApi: expect.objectContaining({
          ok: false,
        }),
      }),
    }));
  });
});
