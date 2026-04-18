import type { Metadata } from "next";

import type { LegacyProduct } from "@/lib/storefront-api";
import {locales, type Locale} from "@/i18n/config";

const FALLBACK_SITE_URL = "https://bricomaitre.com";
const DEFAULT_OG_IMAGE = "/opengraph-image.png";
const OG_LOCALE_BY_LOCALE: Record<Locale, string> = {
  fr: "fr_FR",
  ar: "ar_DZ",
};

type SearchParamPrimitive = string | number | boolean | null | undefined;
type SearchParamValue = SearchParamPrimitive | SearchParamPrimitive[];
type SearchParamInput = URLSearchParams | Record<string, SearchParamValue> | undefined;

export const SITE_NAME = "Bricomaitre";
export const SITE_TITLE = "Bricomaitre | Outillage, bricolage et equipement en Algerie";
export const SITE_DESCRIPTION =
  "Bricomaitre propose de l'outillage, des accessoires et des equipements de bricolage en Algerie avec commande en ligne et livraison nationale.";

function normalizeUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function getSiteUrl() {
  return normalizeUrl(
    process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      FALLBACK_SITE_URL,
  );
}

export function localizePathname(pathname = "/", locale?: string) {
  return normalizePathname(pathname);
}

function normalizeSearchParamValue(value: SearchParamPrimitive) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildSearchParams(searchParams?: SearchParamInput) {
  if (!searchParams) {
    return "";
  }

  const params = new URLSearchParams();

  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => {
      const normalizedValue = normalizeSearchParamValue(value);

      if (normalizedValue) {
        params.append(key, normalizedValue);
      }
    });
  } else {
    const sortedEntries = Object.entries(searchParams).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    for (const [key, value] of sortedEntries) {
      const values = Array.isArray(value) ? value : [value];

      for (const entry of values) {
        const normalizedValue = normalizeSearchParamValue(entry);

        if (normalizedValue) {
          params.append(key, normalizedValue);
        }
      }
    }
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function buildCanonicalUrl(
  pathname = "/",
  locale?: string,
  searchParams?: SearchParamInput,
) {
  return `${getSiteUrl()}${localizePathname(pathname, locale)}${buildSearchParams(searchParams)}`;
}

export function buildLanguageAlternates(
  pathname = "/",
  searchParams?: SearchParamInput,
) {
  const canonical = buildCanonicalUrl(pathname, undefined, searchParams);

  return Object.fromEntries(
    [...locales, "x-default"].map((localeCode) => [localeCode, canonical]),
  ) as Record<Locale | "x-default", string>;
}

export function getOpenGraphLocale(locale?: string) {
  if (!locale || !(locale in OG_LOCALE_BY_LOCALE)) {
    return undefined;
  }

  return OG_LOCALE_BY_LOCALE[locale as Locale];
}

export function getOpenGraphAlternateLocales(locale?: string) {
  if (!locale || !(locale in OG_LOCALE_BY_LOCALE)) {
    return undefined;
  }

  return locales
    .filter((entry) => entry !== locale)
    .map((entry) => OG_LOCALE_BY_LOCALE[entry]);
}

export function toAbsoluteUrl(url?: string | null) {
  if (!url) {
    return undefined;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return buildCanonicalUrl(url);
}

export function sanitizeDescription(value?: string | null, maxLength = 160) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return SITE_DESCRIPTION;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function buildRobots(noIndex = false): Metadata["robots"] {
  if (noIndex) {
    return {
      index: false,
      follow: true,
      nocache: true,
      googleBot: {
        index: false,
        follow: true,
        noimageindex: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    };
  }

  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };
}

export function buildPageMetadata({
  title,
  description,
  pathname = "/",
  locale,
  searchParams,
  images,
  noIndex = false,
  keywords = [],
}: {
  title: string;
  description?: string | null;
  pathname?: string;
  locale?: string;
  searchParams?: SearchParamInput;
  images?: Array<string | null | undefined>;
  noIndex?: boolean;
  keywords?: string[];
}): Metadata {
  const canonical = buildCanonicalUrl(pathname, locale, searchParams);
  const resolvedDescription = sanitizeDescription(description);
  const resolvedImages = dedupe([...(images ?? []), DEFAULT_OG_IMAGE])
    .map((image) => toAbsoluteUrl(image))
    .filter((image): image is string => Boolean(image));
  const openGraphLocale = getOpenGraphLocale(locale);
  const openGraphAlternateLocales = getOpenGraphAlternateLocales(locale);

  return {
    title,
    description: resolvedDescription,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(pathname, searchParams),
    },
    keywords: dedupe(keywords),
    robots: buildRobots(noIndex),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: canonical,
      title,
      description: resolvedDescription,
      locale: openGraphLocale,
      alternateLocale: openGraphAlternateLocales,
      images: resolvedImages.map((image) => ({
        url: image,
      })),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: resolvedDescription,
      images: resolvedImages,
    },
  };
}

export function getLocalizedValue(
  locale: string,
  primary?: string | null,
  secondary?: string | null,
) {
  if (locale === "ar" && secondary && secondary.trim().length > 2) {
    return secondary.trim();
  }

  return (primary ?? secondary ?? "").trim();
}

export function buildProductTitle(product: LegacyProduct, locale: string) {
  return getLocalizedValue(locale, product.title, product.title_ar) || SITE_NAME;
}

export function buildProductDescription(product: LegacyProduct, locale: string) {
  return sanitizeDescription(
    getLocalizedValue(locale, product.description, product.description_ar) ||
      getLocalizedValue(locale, product.summary, product.summary_ar) ||
      SITE_DESCRIPTION,
    180,
  );
}

export function buildProductKeywords(product: LegacyProduct) {
  return dedupe([
    product.title,
    product.title_ar,
    product.brandInfo?.name,
    product.categoryInfo?.name,
    product.categoryInfo?.name_ar,
    product.sku,
    product.barcode,
    "outillage",
    "bricolage",
    "Algerie",
    "Bricomaitre",
  ]);
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: toAbsoluteUrl("/logo.png"),
    sameAs: [
      "https://www.facebook.com/profile.php?id=61562272954715",
      "https://maps.app.goo.gl/MpAM58nHS2G5JBah8",
    ],
  };
}

export function buildStoreSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HardwareStore",
    name: SITE_NAME,
    url: getSiteUrl(),
    image: toAbsoluteUrl(DEFAULT_OG_IMAGE),
    logo: toAbsoluteUrl("/logo.png"),
    email: "bricomaitre@gmail.com",
    telephone: "+213795342826",
    address: {
      "@type": "PostalAddress",
      streetAddress: "BT N20, Cite 08 Mai 45, Bab Ezzouar",
      addressLocality: "Alger",
      postalCode: "16024",
      addressCountry: "DZ",
    },
    areaServed: "DZ",
    sameAs: [
      "https://www.facebook.com/profile.php?id=61562272954715",
      "https://maps.app.goo.gl/MpAM58nHS2G5JBah8",
    ],
  };
}

export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: getSiteUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: `${buildCanonicalUrl("/products")}?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildCollectionPageSchema({
  name,
  description,
  pathname,
  locale,
  searchParams,
}: {
  name: string;
  description: string;
  pathname: string;
  locale?: string;
  searchParams?: SearchParamInput;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: buildCanonicalUrl(pathname, locale, searchParams),
    isPartOf: buildWebsiteSchema(),
  };
}

export function buildContactPageSchema({
  name,
  description,
  pathname,
  locale,
}: {
  name: string;
  description: string;
  pathname: string;
  locale?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name,
    description,
    url: buildCanonicalUrl(pathname, locale),
    mainEntity: buildStoreSchema(),
  };
}

export function buildBreadcrumbSchema(
  items: Array<{ name: string; pathname: string }>,
  locale?: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildCanonicalUrl(item.pathname, locale),
    })),
  };
}

export function buildProductSchema(
  product: LegacyProduct,
  {
    pathname,
    locale,
  }: {
    pathname: string;
    locale: string;
  },
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    productID: String(product.id),
    sku: product.sku ?? undefined,
    gtin: product.barcode ?? undefined,
    name: buildProductTitle(product, locale),
    description: buildProductDescription(product, locale),
    image: (product.images ?? [])
      .map((image) => toAbsoluteUrl(image))
      .filter((image): image is string => Boolean(image)),
    brand: {
      "@type": "Brand",
      name: product.brandInfo?.name || SITE_NAME,
    },
    category:
      getLocalizedValue(
        locale,
        product.categoryInfo?.name,
        product.categoryInfo?.name_ar,
      ) || undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "DZD",
      price: String(product.price ?? 0),
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url: buildCanonicalUrl(pathname, locale),
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };
}
