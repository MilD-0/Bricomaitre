import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StorefrontUpstreamError,
  fetchStorefrontJson,
} from "./storefront-upstream";

describe("storefront-upstream", () => {
  beforeEach(() => {
    process.env.STOREFRONT_API_BASE_URL = "https://storefront-api.example.com";
  });

  it("throws a controlled upstream error when storefront-api is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    await expect(fetchStorefrontJson("/api/storefront/products")).rejects.toBeInstanceOf(StorefrontUpstreamError);
  });
});
