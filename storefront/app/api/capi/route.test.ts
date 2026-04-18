import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  processRequestMock,
  getFbcMock,
  getFbpMock,
  getNormalizedAndHashedPIIMock,
  getCookiesToSetMock,
} = vi.hoisted(() => ({
  processRequestMock: vi.fn(),
  getFbcMock: vi.fn(),
  getFbpMock: vi.fn(),
  getNormalizedAndHashedPIIMock: vi.fn(),
  getCookiesToSetMock: vi.fn(),
}));

vi.mock("capi-param-builder-nodejs", () => ({
  ParamBuilder: class MockParamBuilder {
    processRequest = processRequestMock;
    getFbc = getFbcMock;
    getFbp = getFbpMock;
    getNormalizedAndHashedPII = getNormalizedAndHashedPIIMock;
    getCookiesToSet = getCookiesToSetMock;
  },
}));

import { POST } from "./route";

describe("app/api/capi/route", () => {
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

  it("falls back to legacy token envs only when FACEBOOK_ACCESS_TOKEN is absent", async () => {
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

  it("includes test_event_code in the outgoing payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-test-code" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(createRequest({ test_event_code: "TEST5350" }) as never);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"test_event_code":"TEST5350"'),
      }),
    );
  });

  it("uses stored fbclid when the current URL no longer has it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-fbclid-fallback" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/capi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "bricomaitre.com",
        "user-agent": "Vitest/1.0",
        cookie: "_bric_fbclid=stored-click-id",
      },
      body: JSON.stringify({
        event_name: "PageView",
        event_time: 1_700_000_000,
        event_id: "event-123",
        url: "https://bricomaitre.com/products/example",
      }),
    });

    await POST(request as never);

    expect(processRequestMock).toHaveBeenCalledTimes(1);
    expect(processRequestMock.mock.calls[0]?.[0]).toBe("bricomaitre.com");
    expect(processRequestMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ fbclid: "stored-click-id" }),
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
      metaStatus: 503,
      metaResponse: null,
      effectivePayload: {
        data: [
          {
            event_name: "PageView",
            event_time: 1_700_000_000,
            event_id: "event-123",
            action_source: "website",
            event_source_url: "https://bricomaitre.com/products/example?fbclid=test",
            user_data: {
              client_user_agent: "Vitest/1.0",
            },
            custom_data: {},
          },
        ],
      },
    });
  });

  it("returns 503 when Graph API rejects the event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: {
          message: "Invalid OAuth access token.",
        },
      }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Facebook API 400",
      metaStatus: 400,
      metaResponse: {
        error: {
          message: "Invalid OAuth access token.",
        },
      },
      effectivePayload: {
        data: [
          {
            event_name: "PageView",
            event_time: 1_700_000_000,
            event_id: "event-123",
            action_source: "website",
            event_source_url: "https://bricomaitre.com/products/example?fbclid=test",
            user_data: {
              client_user_agent: "Vitest/1.0",
            },
            custom_data: {},
          },
        ],
      },
    });
  });

  it("returns 200 with success payload when Graph API accepts the event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        events_received: 1,
        messages: [],
        fbtrace_id: "trace-ok",
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(createRequest({
      user_data: {
        em: "ada@example.com",
      },
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        events_received: 1,
        messages: [],
        fbtrace_id: "trace-ok",
      },
      effectivePayload: {
        data: [
          {
            event_name: "PageView",
            event_time: 1_700_000_000,
            event_id: "event-123",
            action_source: "website",
            event_source_url: "https://bricomaitre.com/products/example?fbclid=test",
            user_data: {
              em: "hashed:ada@example.com",
              client_user_agent: "Vitest/1.0",
            },
            custom_data: {},
          },
        ],
      },
    });
  });
});
