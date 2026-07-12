import type { MetadataRoute } from "next";

import { buildCanonicalUrl } from "@/lib/seo";
import {
  fetchStorefrontBrands,
  fetchStorefrontCategories,
  fetchStorefrontProductBuildFeed,
  isNextProductionBuildPhase,
  normalizeBrand,
  normalizeCategory,
} from "@/lib/storefront-api";

export const revalidate = 3600;

function buildLocalizedEntries(
  pathname: string,
  options: Omit<MetadataRoute.Sitemap[number], "url">,
): MetadataRoute.Sitemap {
  return [
    {
      url: buildCanonicalUrl(pathname),
      ...options,
    },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    ...buildLocalizedEntries("/", {
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    }),
    ...buildLocalizedEntries("/products", {
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    }),
    ...buildLocalizedEntries("/contact", {
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  ];

  try {
    const [products, brands, categories] = await Promise.all([
      fetchStorefrontProductBuildFeed(),
      fetchStorefrontBrands().then((items) => items.map(normalizeBrand)),
      fetchStorefrontCategories().then((items) => items.map(normalizeCategory)),
    ]);

    return [
      ...staticPages,
      ...brands
        .filter((brand) => Boolean(brand.slug))
        .flatMap((brand) =>
          buildLocalizedEntries(`/brands/${brand.slug}`, {
            lastModified: new Date(brand.updatedAt),
            changeFrequency: "weekly" as const,
            priority: 0.75,
          }),
        ),
      ...categories
        .filter((category) => Boolean(category.slug))
        .flatMap((category) =>
          buildLocalizedEntries(`/categories/${category.slug}`, {
            lastModified: new Date(category.updatedAt),
            changeFrequency: "weekly" as const,
            priority: 0.8,
          }),
        ),
      ...products.flatMap((product) =>
        buildLocalizedEntries(`/products/${product.slug ?? product.id}`, {
          lastModified: new Date(product.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.8,
        }),
      ),
    ];
  } catch (error) {
    if (isNextProductionBuildPhase()) {
      throw error;
    }

    return staticPages;
  }
}
