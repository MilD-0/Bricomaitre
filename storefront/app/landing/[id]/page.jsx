import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";

import {
  fetchLegacyProductByToken,
} from "@/lib/storefront-api";
import {
  buildBreadcrumbSchema,
  buildPageMetadata,
  buildProductDescription,
  buildProductSchema,
  buildProductTitle,
  serializeJsonLd,
} from "@/lib/seo";

import Main from "./Main";

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
      pathname: `/landing/${id}`,
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
    noIndex: true,
  });
}

export default async function LandingPage({ params }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  const product = await loadProduct(id);

  if (!product) {
    return <Main id={id} />;
  }

  const canonicalPath = `/products/${product.slug}`;
  const structuredData = [
    buildProductSchema(product, {
      pathname: canonicalPath,
      locale,
    }),
    buildBreadcrumbSchema([
      { name: t("acc"), pathname: "/" },
      { name: t("prods"), pathname: "/products" },
      {
        name: buildProductTitle(product, locale),
        pathname: canonicalPath,
      },
    ], locale),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Main id={id} initialProduct={product} />
    </>
  );
}
