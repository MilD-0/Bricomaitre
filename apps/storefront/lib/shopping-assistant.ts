import type {
  StorefrontAssetsResponse,
  StorefrontProductDetailResponse,
  StorefrontProductsResponse,
} from '@bric/storefront-core/contracts';
import {
  shoppingAssistantPageContextSchema,
  type ShoppingAssistantPageContext,
  type ShoppingAssistantProduct,
} from '@bric/storefront-core/shopping-assistant-contracts';

import type { Locale } from '@/i18n/config';
import { parseCatalogPageQuery, toStorefrontCatalogQuery } from '@/lib/catalog-query';
import type { CartItem } from '@/lib/cart';

type CatalogProduct = StorefrontProductsResponse['items'][number];
type ProductDetail = StorefrontProductDetailResponse['item'];
type ProductCard = StorefrontAssetsResponse['productCards'][number];

export type ShoppingAssistantIntent =
  | 'product_search'
  | 'product_comparison'
  | 'compatibility'
  | 'price'
  | 'availability'
  | 'how_to'
  | 'recommendation'
  | 'other';

export type ShoppingAssistantToolPlan = {
  groundingTool: 'search_catalog' | 'inspect_products' | null;
  presentProducts: boolean;
};

export const STOREFRONT_AI_CAPABILITY_FALLBACK_MODEL = 'openai/gpt-5.6-luna';
export const STOREFRONT_AI_MAX_OUTPUT_TOKENS = 900;

export function isRetiredStorefrontAiModel(model: string) {
  return model === 'gpt-5-mini' || model === 'openai/gpt-5-mini';
}

const catalogSearchStopWords = new Set([
  'a',
  'ai',
  'au',
  'aux',
  'avec',
  'ce',
  'cette',
  'ces',
  'cherche',
  'chercher',
  'combien',
  'compare',
  'courte',
  'dans',
  'de',
  'des',
  'disponible',
  'disponibles',
  'du',
  'en',
  'est',
  'et',
  'je',
  'la',
  'le',
  'les',
  'me',
  'moi',
  'montre',
  'pour',
  'produit',
  'produits',
  'recommande',
  'reponse',
  'réponse',
  'stock',
  'tres',
  'très',
  'trouve',
  'trouve-moi',
  'un',
  'une',
  'outil',
  'outils',
  'veux',
  'أبحث',
  'أريد',
  'اعرض',
  'الأداة',
  'الأدوات',
  'السعر',
  'عن',
  'في',
  'لي',
  'منتج',
  'منتجات',
  'متوفر',
  'متوفرة',
  'مع',
]);

export function catalogSearchQuery(value: string) {
  const tokens = (value.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}+.-]*/gu) ?? []).map(
    (token) => token.replace(/^[.-]+|[.-]+$/g, ''),
  );
  const useful = tokens.filter((token) => !catalogSearchStopWords.has(token.toLocaleLowerCase()));
  return (useful.length ? useful : tokens).slice(0, 8).join(' ').slice(0, 160);
}

export function classifyShoppingAssistantIntent(value: string): ShoppingAssistantIntent {
  const text = value.toLocaleLowerCase().normalize('NFKC');
  const includesAny = (...terms: string[]) => terms.some((term) => text.includes(term));
  if (includesAny('compare', 'compar', 'versus', 'vs', 'الفرق', 'قارن', 'مقارنة'))
    return 'product_comparison';
  if (includesAny('compatible', 'compatib', 'fit ', 'works with', 'يركب', 'متوافق', 'يناسب'))
    return 'compatibility';
  if (includesAny('stock', 'available', 'disponib', 'متوفر', 'موجود')) return 'availability';
  if (
    includesAny(
      'recommend',
      'conseil',
      'meilleur',
      'choisir',
      'alternative',
      'propose',
      'اقترح',
      'بديل',
      'أفضل',
      'أنصح',
    )
  )
    return 'recommendation';
  if (
    includesAny(
      'price',
      'prix',
      'coût',
      'combien',
      'moins cher',
      'moins chère',
      'سعر',
      'ثمن',
      'بكم',
    )
  )
    return 'price';
  if (includesAny('how to', 'comment', 'utiliser', 'usage', 'طريقة', 'كيف', 'استعمال'))
    return 'how_to';
  if (includesAny('find', 'search', 'cherche', 'besoin', 'أبحث', 'ابحث', 'أريد', 'أحتاج'))
    return 'product_search';
  return 'other';
}

function asksForProductEvidence(value: string) {
  const text = value.toLocaleLowerCase().normalize('NFKC');
  return [
    'caractér',
    'caracter',
    'détail',
    'detail',
    'explique',
    'puissance',
    'voltage',
    'dimension',
    'matière',
    'spec',
    'ce produit',
    'cet article',
    'المواصفات',
    'خصائص',
    'اشرح',
    'القدرة',
    'فولت',
    'هذا المنتج',
  ].some((term) => text.includes(term));
}

export function shoppingAssistantToolPlan(
  value: string,
  context: { hasInspectableProducts: boolean },
): ShoppingAssistantToolPlan {
  const intent = classifyShoppingAssistantIntent(value);

  if (intent === 'product_search' || intent === 'availability' || intent === 'recommendation') {
    return { groundingTool: 'search_catalog', presentProducts: true };
  }
  if (intent === 'product_comparison') {
    return {
      groundingTool: context.hasInspectableProducts ? 'inspect_products' : 'search_catalog',
      presentProducts: true,
    };
  }
  if (intent === 'compatibility' || intent === 'price') {
    return {
      groundingTool: context.hasInspectableProducts ? 'inspect_products' : 'search_catalog',
      presentProducts: false,
    };
  }
  if (intent === 'how_to' || asksForProductEvidence(value)) {
    return {
      groundingTool: context.hasInspectableProducts ? 'inspect_products' : null,
      presentProducts: false,
    };
  }
  return { groundingTool: null, presentProducts: false };
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

export function shoppingAssistantInstructions(locale: Locale) {
  return [
    'You are the Bricomaitre customer product advisor.',
    'Help customers discover and compare tools using only products returned by the catalog tools.',
    'Use the current page, filters, product, cart, and prior recommendation context when it is supplied.',
    'Search before making any new product recommendation or claim. The search tool covers the full catalog through filters, total counts, and pagination; use another page or narrower filters when needed.',
    'Use product lookup before detailed comparisons. Call present_products with only the product IDs that should appear as recommendation cards.',
    'Keep answers customer-facing and focused on choosing products from the public Bricomaitre catalog.',
    'All numeric catalog prices are Algerian dinars. Render them as DZD in French or دج in Arabic; never label them Dhs, MAD, dollars, or another currency.',
    'Treat inStock as the authoritative customer-facing availability fact and never mention internal field names or conflicting raw status fields.',
    'Never invent specifications, compatibility, availability, delivery promises, warranty, discounts, promotions, or safety claims.',
    'If managed catalog information is incomplete, say exactly what is missing and suggest opening the product page or contacting Bricomaitre. Do not offer to compare a specification unless it was returned by a catalog tool.',
    'For an Arabic catalog search with no relevant match, retry once with a concise French product-type term while preserving any brand or model token.',
    'Clearly identify unavailable products. Do not claim to add anything to cart or place an order.',
    'The response is rendered inside a narrow mobile shopping drawer. Never use Markdown tables or wide comparison layouts. Use short headings and compact stacked bullets instead.',
    'Keep responses concise. Show at most three strong recommendations and briefly explain the catalog evidence for each.',
    `Answer in ${locale === 'ar' ? 'Arabic' : 'French'} unless the customer clearly uses another language.`,
  ].join(' ');
}

export function deterministicAssistantMessage(locale: Locale, productCount: number) {
  if (locale === 'ar') {
    return productCount > 0
      ? 'تعذر تشغيل المستشار الذكي مؤقتًا، لكن هذه أقرب النتائج المتوفرة في الكتالوج. افتح صفحة المنتج للتأكد من التفاصيل.'
      : 'تعذر تشغيل المستشار الذكي مؤقتًا ولم أجد نتيجة مطابقة. يمكنك متابعة البحث في الكتالوج.';
  }
  return productCount > 0
    ? 'Le conseiller intelligent est momentanément indisponible, mais voici les résultats les plus proches du catalogue. Ouvrez un produit pour vérifier ses détails.'
    : 'Le conseiller intelligent est momentanément indisponible et aucun résultat proche n’a été trouvé. Vous pouvez poursuivre dans le catalogue.';
}
