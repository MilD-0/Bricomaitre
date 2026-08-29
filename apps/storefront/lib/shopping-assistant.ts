import type {
  StorefrontAssetsResponse,
  StorefrontEcotrackCatalogResponse,
  StorefrontProductDetailResponse,
  StorefrontProductsResponse,
  StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';
import {
  shoppingAssistantPageContextSchema,
  type ShoppingAssistantPageContext,
  type ShoppingAssistantProduct,
} from '@bric/storefront-core/shopping-assistant-contracts';

import { parseCatalogPageQuery, toStorefrontCatalogQuery } from '@/lib/catalog-query';
import type { CartItem } from '@/lib/cart';

type CatalogProduct = StorefrontProductsResponse['items'][number];
type ProductDetail = StorefrontProductDetailResponse['item'];
type ProductCard = StorefrontAssetsResponse['productCards'][number];

function normalizeDeliveryQuery(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

export function storefrontDeliverySupportEvidence(
  catalog: StorefrontEcotrackCatalogResponse,
  settings: StorefrontSettingsResponse,
  rawQuery: string,
) {
  const query = normalizeDeliveryQuery(rawQuery);
  const matchingCommunes = query
    ? catalog.communes.filter((commune) =>
        [commune.name, commune.postalCode ?? ''].some((value) =>
          normalizeDeliveryQuery(value).includes(query),
        ),
      )
    : [];
  const matchingCommuneWilayaIds = new Set(matchingCommunes.map((commune) => commune.wilayaId));
  const matchingWilayas = catalog.wilayas.filter(
    (wilaya) =>
      !query ||
      String(wilaya.wilayaId) === query ||
      normalizeDeliveryQuery(wilaya.name).includes(query) ||
      matchingCommuneWilayaIds.has(wilaya.wilayaId),
  );
  const visibleWilayas = matchingWilayas.slice(0, query ? 8 : catalog.wilayas.length);

  return {
    contact: {
      phone: settings.phoneEnabled
        ? { display: settings.phoneDisplay, href: settings.phoneHref }
        : null,
      email: settings.contactEmail,
      address: settings.address,
      mapUrl: settings.mapUrl,
      facebookUrl: settings.facebookUrl,
    },
    query: rawQuery.trim(),
    matchedWilayas: visibleWilayas.map((wilaya) => {
      const wilayaCommunes = catalog.communes.filter(
        (commune) => commune.wilayaId === wilaya.wilayaId,
      );
      const wilayaNameMatches =
        !query ||
        String(wilaya.wilayaId) === query ||
        normalizeDeliveryQuery(wilaya.name).includes(query);
      const relevantCommunes = !query
        ? []
        : query && !wilayaNameMatches
          ? matchingCommunes.filter((commune) => commune.wilayaId === wilaya.wilayaId)
          : wilayaCommunes;
      const fee = catalog.serviceFees.find(
        (candidate) =>
          candidate.serviceType === 'livraison' && candidate.wilayaId === wilaya.wilayaId,
      );
      return {
        wilayaId: wilaya.wilayaId,
        name: wilaya.name,
        fees: fee ? { homeDeliveryDzd: fee.homeFee, stopDeskDzd: fee.stopDeskFee } : null,
        communeCount: wilayaCommunes.length,
        stopDeskCommuneCount: wilayaCommunes.filter((commune) => commune.hasStopDesk).length,
        communes: relevantCommunes.slice(0, 20).map((commune) => ({
          name: commune.name,
          postalCode: commune.postalCode,
          hasStopDesk: commune.hasStopDesk,
        })),
        communesTruncated: relevantCommunes.length > 20,
      };
    }),
    matchedWilayaCount: matchingWilayas.length,
    wilayasTruncated: visibleWilayas.length < matchingWilayas.length,
    catalogUpdatedAt: catalog.lastSync?.finishedAt ?? null,
  };
}

export function buildShoppingAssistantPageContext(
  pathname: string,
  searchParams: URLSearchParams,
  cart: CartItem[],
): ShoppingAssistantPageContext {
  const productMatch = pathname.match(/\/(?:fr|ar)\/products\/([^/]+)\/?$/);
  let currentProductToken: string | null = null;
  if (productMatch?.[1]) {
    try {
      currentProductToken = decodeURIComponent(productMatch[1]);
    } catch {
      currentProductToken = productMatch[1];
    }
  }

  const isCatalog = /\/(?:fr|ar)\/products\/?$/.test(pathname);
  const landingMatch = pathname.match(/\/(?:fr|ar)\/landing\/([^/]+)\/?$/);
  let currentLandingPageSlug: string | null = null;
  if (landingMatch?.[1]) {
    try {
      currentLandingPageSlug = decodeURIComponent(landingMatch[1]);
    } catch {
      currentLandingPageSlug = landingMatch[1];
    }
  }
  const isThankYou = /\/(?:fr|ar)\/thank-you\/?$/.test(pathname);
  const orderToken = isThankYou ? searchParams.get('token')?.trim() : null;
  const currentOrderToken = orderToken && orderToken.length >= 20 ? orderToken : null;
  const catalogQuery = isCatalog
    ? toStorefrontCatalogQuery(
        parseCatalogPageQuery({
          q: searchParams.get('q') ?? undefined,
          category: searchParams.get('category') ?? undefined,
          brand: searchParams.get('brand') ?? undefined,
          discounted: searchParams.get('discounted') ?? undefined,
          stock: searchParams.get('stock') ?? undefined,
          minPrice: searchParams.get('minPrice') ?? undefined,
          maxPrice: searchParams.get('maxPrice') ?? undefined,
          sort: searchParams.get('sort') ?? undefined,
          page: searchParams.get('page') ?? undefined,
        }),
      )
    : null;

  return shoppingAssistantPageContextSchema.parse({
    pathname,
    currentProductToken,
    currentLandingPageSlug,
    currentOrderToken,
    catalogQuery: catalogQuery
      ? {
          search: catalogQuery.search,
          brandId: catalogQuery.brandId,
          categoryId: catalogQuery.categoryId,
          discounted: catalogQuery.discounted,
          stock: catalogQuery.stock,
          minPrice: catalogQuery.minPrice,
          maxPrice: catalogQuery.maxPrice,
          sortKey: catalogQuery.sortKey,
          sortDirection: catalogQuery.sortDirection,
          page: catalogQuery.page,
          limit: catalogQuery.limit,
        }
      : null,
    cartItems: cart.map(({ productId, quantity }) => ({ productId, quantity })),
  });
}

function compact(value: string | null, limit = 500) {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function normalizedAvailabilityStatus(inStock: boolean) {
  return inStock ? 'in_stock' : 'out_of_stock';
}

function characteristics(values: string[] | undefined) {
  return (values ?? [])
    .flatMap((value) => {
      const normalized = compact(value, 300);
      return normalized ? [normalized] : [];
    })
    .slice(0, 16);
}

export function toAssistantCatalogProduct(
  product: CatalogProduct,
  meta?: { brand?: string | null; category?: string | null },
  card?: ProductCard,
): ShoppingAssistantProduct {
  return {
    id: product.id,
    token: product.slug || product.mongoId || String(product.id),
    title: card?.titleFr.trim() || product.title,
    titleAr: card?.titleAr.trim() || product.titleAr,
    description: compact(card?.descriptionFr || product.description),
    descriptionAr: compact(card?.descriptionAr || product.descriptionAr),
    sku: compact(product.sku, 120),
    characteristics: characteristics(card?.characteristicsFr),
    characteristicsAr: characteristics(card?.characteristicsAr),
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: normalizedAvailabilityStatus(product.inStock),
    imageUrl: product.images[0] ?? null,
    brand: meta?.brand ?? null,
    category: meta?.category ?? null,
  };
}

export function toAssistantDetailProduct(
  product: ProductDetail,
  card?: ProductCard,
): ShoppingAssistantProduct {
  return {
    id: product.id,
    token: product.canonicalToken,
    title: card?.titleFr.trim() || product.title,
    titleAr: card?.titleAr.trim() || product.titleAr,
    description: compact(card?.descriptionFr || product.description),
    descriptionAr: compact(card?.descriptionAr || product.descriptionAr),
    sku: compact(product.sku, 120),
    characteristics: characteristics(card?.characteristicsFr),
    characteristicsAr: characteristics(card?.characteristicsAr),
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.availability.inStock,
    availabilityStatus: normalizedAvailabilityStatus(product.availability.inStock),
    imageUrl: product.media[0]?.url ?? null,
    brand: product.brand?.name ?? null,
    category: product.category?.name ?? null,
  };
}
