// app/products/[id]/page.js
"use server";

import Head from "next/head";
import Main from "./Main";
import { getTranslations } from "next-intl/server";
import { fetchLegacyProductByToken } from "@/lib/storefront-api";

const FALLBACK_SITE_URL = "https://bricomaitre.com";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, "");
}

async function getProductOrThrow(id) {
  const product = await fetchLegacyProductByToken(id);

  if (!product) {
    throw new Error(`Product not found: ${id}`);
  }

  return product;
}

export async function generateMetadata({ params }) {
  const t = await getTranslations("common");
  const id = params.id;
  const product = await getProductOrThrow(id);

  return {
    title: t("prodt", {
      name: product.title,
      namear: product.title_ar.length > 2 ? product.title_ar : product.title,
    }),
    description: t("prodd", {
      des: product.description,
      desar:
        product.description_ar?.length > 2
          ? product.description_ar
          : product.description,
    }),
    openGraph: {
      images: [{ url: product.images?.[0] }],
    },
  };
}

export default async function Home({ params }) {
  const id = params.id;
  const product = await getProductOrThrow(id);
  const resolvedLegacyId = product._id;
  const canonicalProductToken = product.slug ?? String(product.id);

  const structuredData = {
    "@context": "https://schema.org/",
    "@type": "Product",
    productID: String(product.id),
    name: product.title,
    image: product.images,
    description: product.description,
    brand: {
      "@type": "Brand",
      name: product.brand || "Bricomaitre",
    },
    offers: {
      "@type": "Offer",
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      price: product.price,
      priceCurrency: "DZD",
      itemCondition: "https://schema.org/NewCondition",
      url: `${getSiteUrl()}/products/${canonicalProductToken}`,
    },
  };

  return (
    <>
      <Head>
        {}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </Head>

      {}
      <Main id={resolvedLegacyId} />
    </>
  );
}
