import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchStorefrontUpstreamMock } = vi.hoisted(() => ({
  fetchStorefrontUpstreamMock: vi.fn(),
}));

vi.mock("@/lib/storefront-upstream", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storefront-upstream")>(
    "@/lib/storefront-upstream",
  );
  return {
    ...actual,
    fetchStorefrontUpstream: fetchStorefrontUpstreamMock,
  };
});

import { POST } from "./route";

describe("app/api/capi/route", () => {
  beforeEach(() => {
    fetchStorefrontUpstreamMock.mockReset();
    process.env.STOREFRONT_META_PROXY_SECRET = "proxy-secret";
  });

  it("forwards legacy requests to the canonical strict translator", async () => {
    fetchStorefrontUpstreamMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      queued: true,
      eventId: "event-1",
    }), { status: 202, headers: { "content-type": "application/json" } }));

    const response = await POST(new NextRequest("http://localhost/api/capi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Vitest",
        cookie: "_fbc=fb.1.1.test",
      },
      body: JSON.stringify({
        event_name: "PageView",
        event_id: "event-1",
        url: "https://bricomaitre.com/",
      }),
    }));

    expect(response.status).toBe(202);
    expect(fetchStorefrontUpstreamMock).toHaveBeenCalledWith(
      "/api/capi",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-storefront-meta-proxy-secret": "proxy-secret",
          "user-agent": "Vitest",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: true,
      eventId: "event-1",
    });
  });

  it("does not expose an effective CAPI payload", async () => {
    fetchStorefrontUpstreamMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      queued: true,
      eventId: "event-2",
    }), { status: 202 }));
    const response = await POST(new NextRequest("http://localhost/api/capi", {
      method: "POST",
      body: JSON.stringify({ event_name: "PageView" }),
    }));
    expect(JSON.stringify(await response.json())).not.toContain("effectivePayload");
  });
});
