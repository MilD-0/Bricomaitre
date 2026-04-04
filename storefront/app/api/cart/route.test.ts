import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { fetchLegacyProductsByTokensMock } = vi.hoisted(() => ({
  fetchLegacyProductsByTokensMock: vi.fn(),
}));

vi.mock("@/lib/storefront-api", () => ({
  fetchLegacyProductsByTokens: fetchLegacyProductsByTokensMock,
}));

describe("app/api/cart/route", () => {
  it("fetches only the requested cart product ids", async () => {
    fetchLegacyProductsByTokensMock.mockResolvedValue([
      { _id: "12", title: "Hammer" },
    ]);

    const response = await POST(new Request("http://localhost/api/cart", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ ids: ["12", "12", "14"] }),
    }) as never);

    expect(fetchLegacyProductsByTokensMock).toHaveBeenCalledWith(["12", "12", "14"]);
    await expect(response.json()).resolves.toEqual([
      { _id: "12", title: "Hammer" },
    ]);
  });

  it("returns an empty array for invalid payloads", async () => {
    fetchLegacyProductsByTokensMock.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/cart", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ ids: null }),
    }) as never);

    expect(fetchLegacyProductsByTokensMock).toHaveBeenCalledWith([]);
    await expect(response.json()).resolves.toEqual([]);
  });
});
