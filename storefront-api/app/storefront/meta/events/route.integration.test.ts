import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enqueueMetaBrowserEventMock,
  enforceRequestRateLimitMock,
  getDbMock,
  hasDbMock,
} = vi.hoisted(() => ({
  enqueueMetaBrowserEventMock: vi.fn(),
  enforceRequestRateLimitMock: vi.fn(),
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));

vi.mock("@bric/db/client", () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));
vi.mock("@bric/storefront-core/meta", () => ({
  enqueueMetaBrowserEvent: enqueueMetaBrowserEventMock,
}));
vi.mock("../../../../lib/request-security", () => ({
  enforceRequestRateLimit: enforceRequestRateLimitMock,
  buildRateLimitHeaders: () => ({}),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("https://bricomaitre.com/api/meta/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://bricomaitre.com",
      host: "bricomaitre.com",
      "user-agent": "Vitest",
      "x-real-ip": "203.0.113.10",
      cookie: "_fbc=fb.1.1700000000.click; _fbp=fb.1.1700000000.1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /storefront/meta/events", () => {
  beforeEach(() => {
    process.env.SITE_URL = "https://bricomaitre.com";
    hasDbMock.mockReset().mockReturnValue(true);
    getDbMock.mockReset().mockReturnValue({});
    enqueueMetaBrowserEventMock.mockReset();
    enforceRequestRateLimitMock.mockReset();
    enforceRequestRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
    enqueueMetaBrowserEventMock.mockResolvedValue({ deduped: false, skipped: false });
  });

  it("queues a strict browser event and returns no delivery payload", async () => {
    const response = await POST(request({
      eventId: "event-1",
      eventName: "AddToCart",
      eventSourceUrl: "https://bricomaitre.com/products/1?fbclid=abc",
      items: [{ productId: 1, quantity: 3 }],
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: true,
      eventId: "event-1",
    });
    expect(enqueueMetaBrowserEventMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventName: "AddToCart",
        items: [{ productId: 1, quantity: 3 }],
      }),
      expect.objectContaining({
        clientIpAddress: "203.0.113.10",
        clientUserAgent: "Vitest",
      }),
    );
  });

  it("accepts Search with a normalized search term", async () => {
    const response = await POST(request({
      eventId: "search-1",
      eventName: "Search",
      eventSourceUrl: "https://bricomaitre.com/products?search=perceuse",
      searchTerm: "  perceuse  ",
    }));

    expect(response.status).toBe(202);
    expect(enqueueMetaBrowserEventMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventName: "Search",
        searchTerm: "perceuse",
        items: [],
      }),
      expect.any(Object),
    );
  });

  it("rejects Search without a non-empty search term", async () => {
    const response = await POST(request({
      eventId: "search-blank",
      eventName: "Search",
      eventSourceUrl: "https://bricomaitre.com/products",
      searchTerm: "   ",
    }));

    expect(response.status).toBe(400);
    expect(enqueueMetaBrowserEventMock).not.toHaveBeenCalled();
  });

  it("rejects browser Purchase and arbitrary user data", async () => {
    const response = await POST(request({
      eventId: "purchase-1",
      eventName: "Purchase",
      eventSourceUrl: "https://bricomaitre.com/checkout",
      user_data: { em: "person@example.com" },
    }));
    expect(response.status).toBe(400);
    expect(enqueueMetaBrowserEventMock).not.toHaveBeenCalled();
  });

  it("rejects foreign event source URLs", async () => {
    const response = await POST(request({
      eventId: "event-foreign",
      eventName: "PageView",
      eventSourceUrl: "https://attacker.example/",
    }));
    expect(response.status).toBe(403);
    expect(enqueueMetaBrowserEventMock).not.toHaveBeenCalled();
  });
});
