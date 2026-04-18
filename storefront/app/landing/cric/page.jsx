import { redirect } from "next/navigation";
import { buildSearchParams } from "@/lib/seo";

export default async function CricLandingRedirect({ searchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  redirect(`/products${buildSearchParams(resolvedSearchParams)}`);
}
