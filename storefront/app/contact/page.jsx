import Main from "./Main"
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import {
  buildContactPageSchema,
  buildPageMetadata,
  serializeJsonLd,
} from "@/lib/seo";


export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");

  return buildPageMetadata({
    title: t("con"),
    locale,
    pathname: "/contact",
    description:
      locale === "ar"
        ? "اتصل ببريكوماتر للاستفسار عن المنتجات والتوصيل وطلبات الشراء في الجزائر."
        : "Contactez Bricomaitre pour toute demande sur les produits, la livraison et les commandes en Algerie.",
    keywords: [
      "contact Bricomaitre",
      "Bricomaitre Alger",
      "outillage Algerie",
      "service client Bricomaitre",
    ],
  });
}

export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const description =
    locale === "ar"
      ? "اتصل ببريكوماتر للاستفسار عن المنتجات والتوصيل وطلبات الشراء في الجزائر."
      : "Contactez Bricomaitre pour toute demande sur les produits, la livraison et les commandes en Algerie.";

  const structuredData = buildContactPageSchema({
    name: `${t("con")} | Bricomaitre`,
    description,
    pathname: "/contact",
    locale,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Main />
    </>
  );
}
