import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  fetchStorefrontProductBuildFeed,
  fetchStorefrontProductPromo,
  fetchLegacyProductByToken,
} from "@/lib/storefront-api";
import {
  buildBreadcrumbSchema,
  buildPageMetadata,
  buildProductDescription,
  buildProductKeywords,
  buildProductSchema,
  buildProductTitle,
  serializeJsonLd,
} from "@/lib/seo";

import MetaViewContentBootstrap from "@/app/components/MetaViewContentBootstrap";
import Main from "./Main";

export const revalidate = 120;
export const dynamicParams = true;

export async function generateStaticParams() {
  const products = await fetchStorefrontProductBuildFeed();
  return products.map((product) => ({
    id: product.slug ?? String(product.id),
  }));
}

async function loadProduct(id) {
  return fetchLegacyProductByToken(id);
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const locale = await getLocale();
  const product = await loadProduct(id);

  if (!product) {
    return buildPageMetadata({
      title: "Bricomaitre",
      locale,
      pathname: `/products/${id}`,
      description: "Produit Bricomaitre introuvable.",
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: buildProductTitle(product, locale),
    locale,
    pathname: `/products/${product.slug}`,
    description: buildProductDescription(product, locale),
    images: product.images,
    keywords: buildProductKeywords(product),
  });
}

export default async function Home({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const product = await loadProduct(id);

  if (!product) {
    notFound();
  }
  const promo = await fetchStorefrontProductPromo(
    product.id,
    resolvedSearchParams.promo ?? null,
  );

  const structuredData = [
    buildProductSchema(product, {
      pathname: `/products/${product.slug}`,
      locale,
    }),
    buildBreadcrumbSchema([
      { name: t("acc"), pathname: "/" },
      { name: t("prods"), pathname: "/products" },
      {
        name: buildProductTitle(product, locale),
        pathname: `/products/${product.slug}`,
      },
    ], locale),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MetaViewContentBootstrap
        product={product}
        effectivePrice={promo?.promoPrice ?? product.price}
      />
      <Main
        id={id}
        initialProduct={product}
        promoCode={resolvedSearchParams.promo ?? null}
        initialPromo={promo}
      />
    </>
  );
}
