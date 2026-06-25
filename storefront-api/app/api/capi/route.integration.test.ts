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
vi.mock("../../../lib/request-security", () => ({
  enforceRequestRateLimit: enforceRequestRateLimitMock,
  buildRateLimitHeaders: () => ({}),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("https://bricomaitre.com/api/capi", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://bricomaitre.com",
      host: "bricomaitre.com",
    },
    body: JSON.stringify({
      event_name: "PageView",
      event_id: "event-1",
      url: "https://bricomaitre.com/",
      ...body,
    }),
  });
}

describe("POST /api/capi compatibility translator", () => {
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
    enqueueMetaBrowserEventMock.mockResolvedValue({});
  });

  it("returns 410 for legacy browser Purchase", async () => {
    const response = await POST(request({ event_name: "Purchase" }));
    expect(response.status).toBe(410);
    expect(enqueueMetaBrowserEventMock).not.toHaveBeenCalled();
  });

  it("rejects public test event codes", async () => {
    const response = await POST(request({ test_event_code: "TEST123" }));
    expect(response.status).toBe(400);
  });

  it("drops non-numeric content IDs", async () => {
    const response = await POST(request({
      event_name: "ViewContent",
      custom_data: {
        contents: [
          { id: "12", quantity: 2 },
          { id: "slug-value", quantity: 1 },
        ],
      },
    }));
    expect(response.status).toBe(202);
    expect(enqueueMetaBrowserEventMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        items: [{ productId: 12, quantity: 2 }],
      }),
      expect.any(Object),
    );
  });
});
