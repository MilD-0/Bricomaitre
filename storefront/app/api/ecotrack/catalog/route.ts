import { NextResponse } from "next/server";

import { fetchStorefrontEcotrackCatalog } from "@/lib/storefront-api";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(await fetchStorefrontEcotrackCatalog());
}
