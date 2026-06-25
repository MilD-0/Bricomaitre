import { NextRequest, NextResponse } from "next/server";

import {
  fetchStorefrontEcotrackCatalog,
  findWilayaByName,
} from "@/lib/storefront-api";
import {
  StorefrontUpstreamError,
  fetchStorefrontUpstream,
  isStorefrontUpstreamTimeoutError,
} from "@/lib/storefront-upstream";

const ORDER_UPSTREAM_TIMEOUT_MS = 15_000;
const FORWARDED_UPSTREAM_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
];

function mapDelivery(value: unknown) {
  return value === "office" || value === 1 ? 1 : 0;
}

function buildForwardedResponseHeaders(upstream: Response) {
  const headers = new Headers();

  for (const name of FORWARDED_UPSTREAM_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

async function normalizeState(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) {
    return Number(numericValue);
  }

  try {
    const catalog = await fetchStorefrontEcotrackCatalog();
    return findWilayaByName(catalog.wilayas, trimmed)?.wilayaId ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const normalizedState = await normalizeState(body.state);
  const normalizedCity =
    typeof body.city === "string" && body.city.trim().length > 0
      ? body.city.trim()
      : null;

  if (normalizedState == null || normalizedCity == null) {
    return NextResponse.json(
      { error: "Wilaya and commune are required" },
      { status: 400 },
    );
  }

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
    state: normalizedState,
    city: normalizedCity,
    homeAddress: body.homeAddress ?? null,
    note: body.note ?? null,
    promoCode: typeof body.promoCode === "string" && body.promoCode.trim().length > 0
      ? body.promoCode.trim()
      : null,
    visitId: body.visitId ?? null,
    journeyId: body.journeyId ?? null,
    sessionId: body.sessionId ?? null,
    meta: body.meta ?? undefined,
  };

  try {
    const upstream = await fetchStorefrontUpstream("/api/storefront/orders", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        "x-storefront-meta-proxy-secret": process.env.STOREFRONT_META_PROXY_SECRET ?? "",
        "x-real-ip": request.headers.get("x-real-ip") ?? "",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
        cookie: request.headers.get("cookie") ?? "",
        origin: request.headers.get("origin") ?? "",
        host: request.headers.get("host") ?? "",
      },
      body: JSON.stringify(payload),
      timeoutMs: ORDER_UPSTREAM_TIMEOUT_MS,
    });

    const responseText = await upstream.text();

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: buildForwardedResponseHeaders(upstream),
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
