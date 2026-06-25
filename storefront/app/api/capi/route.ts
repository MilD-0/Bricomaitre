import { NextRequest, NextResponse } from "next/server";

import {
  fetchStorefrontUpstream,
  StorefrontUpstreamError,
} from "@/lib/storefront-upstream";

function upstreamHeaders(request: NextRequest) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-storefront-meta-proxy-secret": process.env.STOREFRONT_META_PROXY_SECRET ?? "",
    "x-real-ip": request.headers.get("x-real-ip") ?? "",
    "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
    "user-agent": request.headers.get("user-agent") ?? "",
    cookie: request.headers.get("cookie") ?? "",
    origin: request.headers.get("origin") ?? "",
    host: request.headers.get("host") ?? "",
  };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  try {
    const upstream = await fetchStorefrontUpstream("/api/capi", {
      method: "POST",
      headers: upstreamHeaders(request),
      body,
      timeoutMs: 5_000,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    if (error instanceof StorefrontUpstreamError) {
      return NextResponse.json({ error: "Meta event service is unavailable." }, { status: 502 });
    }
    throw error;
  }
}
