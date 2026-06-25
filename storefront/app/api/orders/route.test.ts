import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
describe("app/api/orders/route", () => {
  beforeEach(() => {
    process.env.STOREFRONT_API_BASE_URL = "https://storefront-api.example.com";
  });

  it("uses the order-specific upstream timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11, publicToken: "public-token" },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Lovelace",
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storefront-api.example.com/api/storefront/orders",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
        }),
        method: "POST",
        timeoutMs: 15_000,
      }),
    );
  });

  it("returns a controlled 400 for invalid JSON bodies", async () => {
    const response = await POST(new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON request body.",
    });
  });

  it("forwards the idempotency key to storefront-api", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11, publicToken: "public-token" },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "submission-key",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
      }),
    });

    await POST(request as never);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://storefront-api.example.com/api/storefront/orders",
      expect.objectContaining({
        headers: expect.objectContaining({
          "idempotency-key": "submission-key",
        }),
      }),
    );
  });

  it("forwards upstream rate-limit headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Too many order attempts.",
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "600",
        "x-ratelimit-limit": "6",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1780000000",
        "x-request-id": "req-1",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(response.headers.get("x-ratelimit-limit")).toBe("6");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("x-ratelimit-reset")).toBe("1780000000");
    expect(response.headers.get("x-request-id")).toBe("req-1");
    await expect(response.json()).resolves.toEqual({
      error: "Too many order attempts.",
    });
  });

  it("returns a controlled 502 when storefront-api is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Lovelace",
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Storefront API is unavailable",
    });
  });

  it("logs timeout-specific upstream failures for order creation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Lovelace",
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(502);
    expect(errorSpy).toHaveBeenCalledWith(
      "[storefront] order upstream timed out",
      expect.objectContaining({
        timeoutMs: 15_000,
      }),
    );
    errorSpy.mockRestore();
  });

  it("normalizes numeric string state values before forwarding upstream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11, publicToken: "public-token" },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: "16",
        city: "Algiers",
      }),
    });

    await POST(request as never);

    const forwardedBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(forwardedBody.state).toBe(16);
  });

  it("forwards promoCode to storefront-api", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11, publicToken: "public-token" },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: 16,
        city: "Algiers",
        promoCode: "Spring-50",
      }),
    });

    await POST(request as never);

    const forwardedBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(forwardedBody.promoCode).toBe("Spring-50");
  });

  it("rejects orders without a wilaya and commune", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: null,
        city: "",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Wilaya and commune are required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes wilaya names through the Ecotrack catalog before forwarding upstream", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        wilayas: [{ wilayaId: 16, name: "Alger" }],
        communes: [],
        serviceFees: [],
        weightFees: [],
        lastSync: null,
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        item: { id: 11, publicToken: "public-token" },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber1: "0550123456",
        cartProducts: ["1"],
        delivery: "home",
        state: "Alger",
        city: "Algiers",
      }),
    });

    await POST(request as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const forwardedBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body);
    expect(forwardedBody.state).toBe(16);
  });
});
