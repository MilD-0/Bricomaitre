import Thank from "./Thank"
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");

  return buildPageMetadata({
    title: t("mrc"),
    locale,
    pathname: "/thank-you",
    description: "Confirmation de commande Bricomaitre",
    noIndex: true,
  });
}
export default async function Home({ searchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return <Thank modified={resolvedSearchParams.modified != null} />
}
