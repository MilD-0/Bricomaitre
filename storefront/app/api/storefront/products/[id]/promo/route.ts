import { NextRequest, NextResponse } from "next/server";

import {
  StorefrontUpstreamError,
  fetchStorefrontUpstream,
  isStorefrontUpstreamTimeoutError,
} from "@/lib/storefront-upstream";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const upstreamPath = `/api/storefront/products/${encodeURIComponent(id)}/promo?code=${encodeURIComponent(code)}`;

  try {
    const upstream = await fetchStorefrontUpstream(upstreamPath, {
      headers: { accept: "application/json" },
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
        `[storefront] promo upstream ${isStorefrontUpstreamTimeoutError(error) ? "timed out" : "failed"}`,
        {
          pathname: error.pathname,
          message: error.message,
        },
      );
      return NextResponse.json({ ok: false, promo: null }, { status: 200 });
    }

    throw error;
  }
}
