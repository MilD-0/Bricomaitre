import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";

import ProductsMain from "@/app/products/Main";
import {
  fetchLegacyProductsPage,
  fetchStorefrontCategories,
  normalizeCategory,
} from "@/lib/storefront-api";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
  buildPageMetadata,
  serializeJsonLd,
} from "@/lib/seo";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const categories = (await fetchStorefrontCategories()).map(normalizeCategory);
  return categories
    .filter((category) => Boolean(category.slug))
    .map((category) => ({ slug: category.slug }));
}

async function loadCategory(slug) {
  const categories = (await fetchStorefrontCategories()).map(normalizeCategory);
  const category = categories.find((item) => item.slug === slug) ?? null;

  if (!category) {
    return { category: null, parent: null };
  }

  return {
    category,
    parent: category.parent
      ? categories.find((item) => item._id === category.parent) ?? null
      : null,
  };
}

export async function generateMetadata({ params, searchParams }) {
  const locale = await getLocale();
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const { category } = await loadCategory(resolvedParams.slug);

  if (!category) {
    return buildPageMetadata({
      title: "Bricomaitre",
      locale,
      pathname: `/categories/${resolvedParams.slug}`,
      description: "Categorie introuvable.",
      noIndex: true,
    });
  }

  const name =
    locale === "ar" && category.name_ar?.trim().length > 2
      ? category.name_ar
      : category.name;
  const description =
    locale === "ar"
      ? `استكشف فئة ${name} لدى بريكوماتر واطلب الأدوات المتوفرة مع التوصيل في الجزائر.`
      : `Explorez la categorie ${name} chez Bricomaitre et commandez vos outils avec livraison en Algerie.`;

  return buildPageMetadata({
    title: `${name} | Bricomaitre`,
    locale,
    pathname: `/categories/${category.slug}`,
    searchParams: resolvedSearchParams,
    description,
    images: [category.image],
    keywords: [name, "Bricomaitre", "outillage Algerie", "categorie outillage"],
  });
}

export default async function CategoryPage({ params, searchParams }) {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const { category, parent } = await loadCategory(resolvedParams.slug);

  if (!category) {
    notFound();
  }

  const name =
    locale === "ar" && category.name_ar?.trim().length > 2
      ? category.name_ar
      : category.name;
  const description =
    locale === "ar"
      ? `استكشف فئة ${name} لدى بريكوماتر واطلب الأدوات المتوفرة مع التوصيل في الجزائر.`
      : `Explorez la categorie ${name} chez Bricomaitre et commandez vos outils avec livraison en Algerie.`;
  const breadcrumbItems = [
    { name: t("acc"), pathname: "/" },
    { name: t("prods"), pathname: "/products" },
  ];

  if (parent?.slug) {
    breadcrumbItems.push({
      name: locale === "ar" && parent.name_ar?.trim().length > 2 ? parent.name_ar : parent.name,
      pathname: `/categories/${parent.slug}`,
    });
  }

  breadcrumbItems.push({ name, pathname: `/categories/${category.slug}` });

  const structuredData = [
    buildCollectionPageSchema({
      name: `${name} | Bricomaitre`,
      description,
      pathname: `/categories/${category.slug}`,
      locale,
      searchParams: resolvedSearchParams,
    }),
    buildBreadcrumbSchema(breadcrumbItems, locale),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <ProductsMain
        forcedCategorySlug={category.slug}
        pageTitle={`${name} | Bricomaitre`}
        pageDescription={description}
        initialData={await fetchLegacyProductsPage({
          page: Number(resolvedSearchParams.page ?? "1"),
          limit: 20,
          search: resolvedSearchParams.search,
          category: category.slug,
          childCategory: resolvedSearchParams.childCategory,
          brand: resolvedSearchParams.brand,
          instock: resolvedSearchParams.instock === "true",
          sortby: resolvedSearchParams.sortby,
        })}
      />
    </>
  );
}
