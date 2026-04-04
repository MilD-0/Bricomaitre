import { NextRequest, NextResponse } from "next/server";

import {
  StorefrontUpstreamError,
  fetchStorefrontUpstream,
  isStorefrontUpstreamTimeoutError,
} from "@/lib/storefront-upstream";

const ORDER_UPSTREAM_TIMEOUT_MS = 15_000;

function mapDelivery(value: unknown) {
  return value === "office" || value === 1 ? 1 : 0;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const payload = {
    firstName: body.firstName ?? null,
    lastName: body.lastName ?? null,
    email: body.email ?? null,
    phoneNumber1: body.phoneNumber1,
    phoneNumber2: body.phoneNumber2 ?? null,
    cartProducts: Array.isArray(body.cartProducts)
      ? body.cartProducts.map((value: unknown) => String(value))
      : [],
    delivery: mapDelivery(body.delivery),
    state:
      typeof body.state === "number"
        ? body.state
        : Number.isFinite(Number(body.state))
          ? Number(body.state)
          : null,
    city: body.city ?? null,
    homeAddress: body.homeAddress ?? null,
    note: body.note ?? null,
    journeyId: body.journeyId ?? null,
    sessionId: body.sessionId ?? null,
  };

  try {
    const upstream = await fetchStorefrontUpstream("/api/storefront/orders", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: ORDER_UPSTREAM_TIMEOUT_MS,
    });

    const responseText = await upstream.text();

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    if (error instanceof StorefrontUpstreamError) {
      console.error(
        `[storefront] order upstream ${isStorefrontUpstreamTimeoutError(error) ? "timed out" : "failed"}`,
        {
          pathname: error.pathname,
          timeoutMs: ORDER_UPSTREAM_TIMEOUT_MS,
          message: error.message,
        },
      );
      return NextResponse.json(
        { error: "Storefront API is unavailable" },
        { status: 502 },
      );
    }

    throw error;
  }
}
