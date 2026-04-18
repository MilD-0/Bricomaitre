import {redirect} from "@/i18n/navigation";
import { buildSearchParams } from "@/lib/seo";

export default async function CricLandingRedirect({params, searchParams}) {
  const { locale } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  redirect({href: `/products${buildSearchParams(resolvedSearchParams)}`, locale});
}
