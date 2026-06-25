import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StorefrontOrderClientError,
  createStorefrontOrder,
  patchStorefrontOrder,
  readVerifiedStorefrontOrder,
} from "./storefront-order-client";

describe("storefront-order-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an order and requires a public token in the success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: {
        id: 11,
        publicToken: "public-token",
        variant: null,
        isDegradedCapture: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: ["1"],
        orderProducts: [],
        delivery: 0,
        state: 16,
        city: "Algiers",
        homeAddress: "Street 1",
        productSubtotal: 1000,
        deliveryFee: 400,
        totalAmount: 1400,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    }), { status: 200 })));

    const result = await createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    });

    expect(result.id).toBe(11);
    expect(result.publicToken).toBe("public-token");
    expect(fetch).toHaveBeenCalledWith("/api/orders", expect.objectContaining({
      headers: expect.objectContaining({
        "idempotency-key": "submission-key",
      }),
    }));
  });

  it("rejects a malformed create success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11 },
    }), { status: 200 })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      name: "StorefrontOrderClientError",
    });
  });

  it("surfaces create network failures as client errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "request_network_error",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("surfaces order rate limits with a retry delay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Too many order attempts.",
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "600",
      },
    })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 600,
      message: "Trop de tentatives de commande. Reessayez dans environ 10 minutes.",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("surfaces structured validation errors without falling back to a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Invalid order request.",
      details: {
        fieldErrors: {
          email: ["Invalid email address"],
          cartProducts: ["Too big"],
        },
      },
    }), {
      status: 400,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-1",
      },
    })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111", email: "not-email" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "validation_failed",
      status: 400,
      requestId: "req-1",
      message: "Invalid order request. Verifiez: email, produits.",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("surfaces server errors with the request reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 500,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-2",
      },
    })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "server_error",
      status: 500,
      requestId: "req-2",
      message: "Le serveur de commande a rencontre une erreur. Reessayez dans quelques minutes. Reference: req-2.",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("surfaces in-flight idempotency conflicts as a retryable pending request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Order request is already being processed.",
    }), {
      status: 409,
      headers: {
        "content-type": "application/json",
        "retry-after": "60",
      },
    })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "request_conflict",
      status: 409,
      retryAfterSeconds: 60,
      message: "Une tentative precedente est encore en cours de traitement. Attendez environ 1 minute, puis utilisez Reprendre l'envoi.",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("rejects a create response missing the order token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: {
        id: 11,
        publicToken: null,
        variant: null,
        isDegradedCapture: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstName: null,
        lastName: null,
        fullName: "0550111111",
        email: null,
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: [],
        orderProducts: [],
        delivery: 0,
        state: null,
        city: null,
        homeAddress: null,
        productSubtotal: 0,
        deliveryFee: 0,
        totalAmount: 0,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    }), { status: 200 })));

    await expect(createStorefrontOrder({
      payload: { phoneNumber1: "0550111111" },
      submissionKey: "submission-key",
    })).rejects.toMatchObject({
      code: "missing_order_token",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("verifies an order read response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      item: {
        id: 11,
        publicToken: "public-token",
        variant: null,
        isDegradedCapture: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: ["1"],
        orderProducts: [],
        delivery: 0,
        state: 16,
        city: "Algiers",
        homeAddress: "Street 1",
        productSubtotal: 1000,
        deliveryFee: 400,
        totalAmount: 1400,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    }), { status: 200 })));

    const result = await readVerifiedStorefrontOrder({
      orderId: 11,
      token: "public-token",
    });

    expect(result.id).toBe(11);
    expect(fetch).toHaveBeenCalledWith(
      "/api/storefront/orders/11?token=public-token",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a malformed verification response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      item: { id: "wrong" },
    }), { status: 200 })));

    await expect(readVerifiedStorefrontOrder({
      orderId: 11,
      token: "public-token",
    })).rejects.toMatchObject({
      code: "invalid_read_response",
    } satisfies Partial<StorefrontOrderClientError>);
  });

  it("patches an order and validates the response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: {
        id: 11,
        publicToken: "public-token",
        variant: null,
        isDegradedCapture: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: ["1"],
        orderProducts: [],
        delivery: 0,
        state: 16,
        city: "Algiers",
        homeAddress: "Street 1",
        productSubtotal: 1000,
        deliveryFee: 400,
        totalAmount: 1400,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    }), { status: 200 })));

    const result = await patchStorefrontOrder({
      orderId: 11,
      token: "public-token",
      payload: { city: "Oran" },
    });

    expect(result.id).toBe(11);
  });
});
