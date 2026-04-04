import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";

import ProductsMain from "@/app/products/Main";
import {
  fetchLegacyProductsPage,
  fetchStorefrontBrands,
  normalizeBrand,
} from "@/lib/storefront-api";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
  buildPageMetadata,
  serializeJsonLd,
} from "@/lib/seo";

export const revalidate = 60;
export const dynamicParams = true;

async function loadBrand(slug) {
  const brands = (await fetchStorefrontBrands()).map(normalizeBrand);
  return brands.find((brand) => brand.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }) {
  const locale = await getLocale();
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const brand = await loadBrand(resolvedParams.slug);

  if (!brand) {
    return buildPageMetadata({
      title: "Bricomaitre",
      locale,
      pathname: `/brands/${resolvedParams.slug}`,
      description: "Marque introuvable.",
      noIndex: true,
    });
  }

  const title =
    locale === "ar"
      ? `${brand.name} | ماركات بريكوماتر`
      : `${brand.name} | Marques Bricomaitre`;
  const description =
    locale === "ar"
      ? `تصفح منتجات ${brand.name} المتوفرة لدى بريكوماتر مع طلب عبر الإنترنت وتوصيل في الجزائر.`
      : `Parcourez les produits ${brand.name} disponibles chez Bricomaitre avec commande en ligne et livraison en Algerie.`;

  return buildPageMetadata({
    title,
    locale,
    pathname: `/brands/${brand.slug}`,
    searchParams: resolvedSearchParams,
    description,
    images: [brand.image],
    keywords: [brand.name, "Bricomaitre", "outillage Algerie", "marque outillage"],
  });
}

export default async function BrandPage({ params, searchParams }) {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const brand = await loadBrand(resolvedParams.slug);

  if (!brand) {
    notFound();
  }

  const title =
    locale === "ar"
      ? `${brand.name} | ماركات بريكوماتر`
      : `${brand.name} | Marques Bricomaitre`;
  const description =
    locale === "ar"
      ? `تصفح منتجات ${brand.name} المتوفرة لدى بريكوماتر مع طلب عبر الإنترنت وتوصيل في الجزائر.`
      : `Parcourez les produits ${brand.name} disponibles chez Bricomaitre avec commande en ligne et livraison en Algerie.`;
  const structuredData = [
    buildCollectionPageSchema({
      name: title,
      description,
      pathname: `/brands/${brand.slug}`,
      locale,
      searchParams: resolvedSearchParams,
    }),
    buildBreadcrumbSchema([
      { name: t("acc"), pathname: "/" },
      { name: t("prods"), pathname: "/products" },
      { name: brand.name, pathname: `/brands/${brand.slug}` },
    ], locale),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <ProductsMain
        forcedBrandSlug={brand.slug}
        pageTitle={title}
        pageDescription={description}
        initialData={await fetchLegacyProductsPage({
          page: Number(resolvedSearchParams.page ?? "1"),
          limit: 20,
          search: resolvedSearchParams.search,
          category: resolvedSearchParams.category,
          childCategory: resolvedSearchParams.childCategory,
          brand: brand.slug,
          instock: resolvedSearchParams.instock === "true",
          sortby: resolvedSearchParams.sortby,
        })}
      />
    </>
  );
}
