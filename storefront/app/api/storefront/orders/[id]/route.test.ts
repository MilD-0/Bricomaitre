import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "./route";

describe("app/api/storefront/orders/[id]/route", () => {
  beforeEach(() => {
    process.env.STOREFRONT_API_BASE_URL = "https://storefront-api.example.com";
    vi.restoreAllMocks();
  });

  it("forwards retry and request headers from order verification responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Too many order lookup requests." }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "60",
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1780000000",
        "x-request-id": "req-verify",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/storefront/orders/11?token=public-token"),
      { params: Promise.resolve({ id: "11" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("x-ratelimit-limit")).toBe("60");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("x-ratelimit-reset")).toBe("1780000000");
    expect(response.headers.get("x-request-id")).toBe("req-verify");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storefront-api.example.com/api/storefront/orders/11?token=public-token",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards retry and request headers from order patch responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Too many order update requests." }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "30",
        "x-request-id": "req-patch",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(
      new NextRequest("http://localhost/api/storefront/orders/11?token=public-token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber1: "0550111111" }),
      }),
      { params: Promise.resolve({ id: "11" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("x-request-id")).toBe("req-patch");
  });
});
