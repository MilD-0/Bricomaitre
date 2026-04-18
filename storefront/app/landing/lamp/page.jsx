import { redirect } from "next/navigation";
import { buildSearchParams } from "@/lib/seo";

export default async function LampLandingRedirect({ searchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  redirect(`/products${buildSearchParams(resolvedSearchParams)}`);
}
