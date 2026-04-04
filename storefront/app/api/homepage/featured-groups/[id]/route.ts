import { NextResponse } from "next/server";

import { fetchHomepageFeaturedGroup } from "@/lib/storefront-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const revalidate = 300;

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const group = await fetchHomepageFeaturedGroup(id);

  return NextResponse.json(group, { status: group ? 200 : 404 });
}
