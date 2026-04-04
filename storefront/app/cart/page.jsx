import Main from "./Main"
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");

  return buildPageMetadata({
    title: t("cart"),
    locale,
    pathname: "/cart",
    description: "Panier Bricomaitre",
    noIndex: true,
  });
}

export default function Home() {
  return <Main />
}
