import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  processRequestMock,
  getFbcMock,
  getFbpMock,
  getClientIpAddressMock,
  getNormalizedAndHashedPIIMock,
  getCookiesToSetMock,
} = vi.hoisted(() => ({
  processRequestMock: vi.fn(),
  getFbcMock: vi.fn(),
  getFbpMock: vi.fn(),
  getClientIpAddressMock: vi.fn(),
  getNormalizedAndHashedPIIMock: vi.fn(),
  getCookiesToSetMock: vi.fn(),
}));

vi.mock("capi-param-builder-nodejs", () => ({
  ParamBuilder: class MockParamBuilder {
    processRequest = processRequestMock;
    getFbc = getFbcMock;
    getFbp = getFbpMock;
    getClientIpAddress = getClientIpAddressMock;
    getNormalizedAndHashedPII = getNormalizedAndHashedPIIMock;
    getCookiesToSet = getCookiesToSetMock;
  },
}));

import { POST } from "./route";

describe("storefront-old app/api/capi/route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "pixel-123";
    process.env.FACEBOOK_ACCESS_TOKEN = "facebook-access-token";
    delete process.env.META_CONVERSIONS_API_TOKEN;
    delete process.env.FB_TOKEN;
    delete process.env.TOKEN;

    processRequestMock.mockReset();
    getFbcMock.mockReset().mockReturnValue(undefined);
    getFbpMock.mockReset().mockReturnValue(undefined);
    getClientIpAddressMock.mockReset().mockReturnValue(undefined);
    getNormalizedAndHashedPIIMock.mockReset().mockImplementation((value: string) => `hashed:${value}`);
    getCookiesToSetMock.mockReset().mockReturnValue([]);
  });

  function createRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/capi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "bricomaitre.com",
        "user-agent": "Vitest/1.0",
      },
      body: JSON.stringify({
        event_name: "PageView",
        event_time: 1_700_000_000,
        event_id: "event-123",
        url: "https://bricomaitre.com/products/example?fbclid=test",
        ...body,
      }),
    });
  }

  it("uses FACEBOOK_ACCESS_TOKEN when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v22.0/pixel-123/events?access_token=facebook-access-token",
      expect.any(Object),
    );
  });

  it("falls back to TOKEN only when FACEBOOK_ACCESS_TOKEN is absent", async () => {
    delete process.env.FACEBOOK_ACCESS_TOKEN;
    process.env.TOKEN = "legacy-token";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-legacy" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v22.0/pixel-123/events?access_token=legacy-token",
      expect.any(Object),
    );
  });

  it("returns 503 when Meta credentials are missing", async () => {
    delete process.env.FACEBOOK_ACCESS_TOKEN;
    delete process.env.META_CONVERSIONS_API_TOKEN;
    delete process.env.FB_TOKEN;
    delete process.env.TOKEN;

    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Missing Facebook credentials.",
    });
  });
});
