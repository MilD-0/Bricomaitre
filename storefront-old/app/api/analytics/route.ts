import { NextRequest, NextResponse } from "next/server";

import {
  StorefrontUpstreamError,
  fetchStorefrontUpstream,
} from "@/lib/storefront-upstream";

export async function POST(request: NextRequest) {
  const body = await request.text();

  try {
    const upstream = await fetchStorefrontUpstream("/api/storefront/analytics", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
      timeoutMs: 2_000,
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
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    throw error;
  }
}
