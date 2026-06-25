import { NextRequest, NextResponse } from "next/server";

import {
  StorefrontUpstreamError,
  buildStorefrontApiUrl,
  fetchStorefrontUpstream,
} from "@/lib/storefront-upstream";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const FORWARDED_UPSTREAM_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
];

function buildUpstreamPath(id: string, request: NextRequest) {
  const url = new URL(buildStorefrontApiUrl(`/api/storefront/orders/${id}`));
  url.search = request.nextUrl.search;
  return `${url.pathname}${url.search}`;
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

function forwardHeaders(request: NextRequest) {
  const headers = new Headers({
    accept: "application/json",
  });

  const contentType = request.headers.get("content-type");
  const token = request.headers.get("x-order-token");

  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (token) {
    headers.set("x-order-token", token);
  }

  return headers;
}

async function proxy(method: "GET" | "PATCH", request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const upstream = await fetchStorefrontUpstream(buildUpstreamPath(id, request), {
      method,
      headers: forwardHeaders(request),
      body: method === "PATCH" ? await request.text() : undefined,
    });
    const responseText = await upstream.text();

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: buildForwardedResponseHeaders(upstream),
    });
  } catch (error) {
    if (error instanceof StorefrontUpstreamError) {
      return NextResponse.json(
        { error: "Storefront API is unavailable" },
        { status: 502 },
      );
    }

    throw error;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy("GET", request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy("PATCH", request, context);
}
