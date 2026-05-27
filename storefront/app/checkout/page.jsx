import Main from "./Main"
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";


export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");

  return buildPageMetadata({
    title: t("cas"),
    locale,
    pathname: "/checkout",
    description: "Finalisation de commande Bricomaitre",
    noIndex: true,
  });
}
export default async function Home({ searchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return <Main order={resolvedSearchParams.order ?? null} product={resolvedSearchParams.id ?? null} promoCode={resolvedSearchParams.promo ?? null} />
}
