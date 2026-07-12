import { NextResponse } from "next/server";

import { buildHomepageData } from "@/lib/storefront-api";

export const revalidate = 300;

export async function GET() {
  return NextResponse.json(await buildHomepageData());
}
