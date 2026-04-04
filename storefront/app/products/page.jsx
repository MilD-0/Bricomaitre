import Main from "./Main"
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { fetchLegacyProductsPage } from "@/lib/storefront-api";
import {
  buildCollectionPageSchema,
  buildPageMetadata,
  serializeJsonLd,
} from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({ searchParams }) {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const resolvedSearchParams = (await searchParams) ?? {};

  return buildPageMetadata({
    title: t("prods"),
    locale,
    pathname: "/products",
    searchParams: resolvedSearchParams,
    description:
      locale === "ar"
        ? "تصفح منتجات بريكوماتر من الأدوات الكهربائية والميكانيكية وملحقات الورش المتوفرة للطلب في الجزائر."
        : "Parcourez les produits Bricomaitre: outillage mecanique, electroportatif, accessoires et equipements disponibles en Algerie.",
    keywords: [
      "produits Bricomaitre",
      "catalogue outillage",
      "outillage Algerie",
      "electroportatif",
      "bricolage",
    ],
  });
}

export default async function Home({ searchParams }) {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const resolvedSearchParams = (await searchParams) ?? {};
  const description =
    locale === "ar"
      ? "تصفح منتجات بريكوماتر من الأدوات الكهربائية والميكانيكية وملحقات الورش المتوفرة للطلب في الجزائر."
      : "Parcourez les produits Bricomaitre: outillage mecanique, electroportatif, accessoires et equipements disponibles en Algerie.";

  const structuredData = buildCollectionPageSchema({
    name: `${t("prods")} | Bricomaitre`,
    description,
    pathname: "/products",
    locale,
    searchParams: resolvedSearchParams,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Main
        initialData={await fetchLegacyProductsPage({
          page: Number(resolvedSearchParams.page ?? "1"),
          limit: 20,
          search: resolvedSearchParams.search,
          category: resolvedSearchParams.category,
          childCategory: resolvedSearchParams.childCategory,
          brand: resolvedSearchParams.brand,
          instock: resolvedSearchParams.instock === "true",
          sortby: resolvedSearchParams.sortby,
        })}
      />
    </>
  );
}
