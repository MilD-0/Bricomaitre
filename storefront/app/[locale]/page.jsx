import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";

import Main from "../Main";
import {
  buildOrganizationSchema,
  buildPageMetadata,
  buildStoreSchema,
  buildWebsiteSchema,
  serializeJsonLd,
} from "@/lib/seo";

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Layout");

  return buildPageMetadata({
    title: `${t("acc")} | Bricomaitre`,
    locale,
    pathname: "/",
    description:
      locale === "ar"
        ? "بريكوماتر لبيع الأدوات والتجهيزات وملحقات الورش في الجزائر مع طلب عبر الإنترنت وتوصيل وطني."
        : "Achetez de l'outillage, des accessoires et des equipements de bricolage chez Bricomaitre avec livraison partout en Algerie.",
    keywords: [
      "Bricomaitre",
      "outillage Algerie",
      "bricolage Algerie",
      "materiel atelier",
      "outillage mecanique",
      "outillage electroportatif",
    ],
  });
}

export default function LocalizedHomePage() {
  const structuredData = [
    buildOrganizationSchema(),
    buildStoreSchema(),
    buildWebsiteSchema(),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Main initialHomepageData={{ banners: [], featuredGroups: [], cards: [], brands: [] }} />
    </>
  );
}
