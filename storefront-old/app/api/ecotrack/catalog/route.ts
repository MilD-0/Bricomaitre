import { NextResponse } from "next/server";

import { fetchStorefrontEcotrackCatalog } from "@/lib/storefront-api";

export async function GET() {
  return NextResponse.json(await fetchStorefrontEcotrackCatalog());
}
