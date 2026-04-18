import { NextRequest, NextResponse } from "next/server";

import {
  fetchLegacyProductsByTokens,
} from "@/lib/storefront-api";

export async function POST(request: NextRequest) {
  const { ids } = await request.json();
  return NextResponse.json(
    await fetchLegacyProductsByTokens(Array.isArray(ids) ? ids : []),
  );
}
