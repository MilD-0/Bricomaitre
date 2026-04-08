import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInternalRequest } from "@bric/runtime/internal-signing";

import { POST } from "./route";

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

describe("app/api/internal/revalidate/route", () => {
  beforeEach(() => {
    process.env.STOREFRONT_REVALIDATE_SECRET = "revalidate-secret";
    revalidateTagMock.mockReset();
  });

  it("rejects unsigned requests", async () => {
    const response = await POST(new NextRequest("http://localhost/api/internal/revalidate", {
      method: "POST",
      body: JSON.stringify({ scope: "assets" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("revalidates storefront asset caches for signed requests", async () => {
    const body = JSON.stringify({ scope: "assets" });
    const timestamp = String(Date.now());
    const signature = signInternalRequest(body, "revalidate-secret", timestamp);

    const response = await POST(new NextRequest("http://localhost/api/internal/revalidate", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-revalidate-timestamp": timestamp,
        "x-revalidate-signature": signature,
      },
    }));

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenNthCalledWith(1, "storefront-assets", "max");
    expect(revalidateTagMock).toHaveBeenNthCalledWith(2, "storefront-catalog-context", "max");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revalidated: ["storefront-assets", "storefront-catalog-context"],
    });
  });
});
