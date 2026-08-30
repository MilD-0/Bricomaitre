import type { StorefrontSettingsResponse } from '@bric/storefront-core/contracts';
import {
  shoppingAssistantCartManagementSchema,
  shoppingAssistantCartMutationSchema,
  shoppingAssistantCatalogSearchResultSchema,
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantDeliverySupportLookupSchema,
  shoppingAssistantGuidanceRequestSchema,
  shoppingAssistantOrderLookupSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantProductSelectionSchema,
  shoppingAssistantPromotionLookupSchema,
  type ShoppingAssistantCartMutation,
  type ShoppingAssistantProduct,
  type ShoppingAssistantRequest,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { tool } from 'ai';

import { getCustomerOrderTrackingState } from '@/lib/order-tracking';
import {
  storefrontDeliverySupportEvidence,
  toAssistantCatalogProduct,
  toAssistantDetailProduct,
} from '@/lib/shopping-assistant';
import { readShoppingAssistantGuidance } from '@/lib/shopping-assistant-runtime';
import {
  fetchStorefrontAssets,
  fetchStorefrontCartValidation,
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontOrderByToken,
  fetchStorefrontProductDetail,
  fetchStorefrontProductPromo,
  getStorefrontEcotrackCatalog,
  getStorefrontLandingPage,
} from '@/lib/storefront-api';

const MAX_CART_PRODUCTS_CHANGED_PER_TURN = 8;

type ShoppingAssistantDependencies = {
  fetchAssets: typeof fetchStorefrontAssets;
  fetchCartValidation: typeof fetchStorefrontCartValidation;
  fetchCatalog: typeof fetchStorefrontCatalog;
  fetchCatalogMeta: typeof fetchStorefrontCatalogMeta;
  fetchOrderByToken: typeof fetchStorefrontOrderByToken;
  fetchProductDetail: typeof fetchStorefrontProductDetail;
  fetchProductPromo: typeof fetchStorefrontProductPromo;
  getDeliveryCatalog: typeof getStorefrontEcotrackCatalog;
  getLandingPage: typeof getStorefrontLandingPage;
};

const defaultDependencies: ShoppingAssistantDependencies = {
  fetchAssets: fetchStorefrontAssets,
  fetchCartValidation: fetchStorefrontCartValidation,
  fetchCatalog: fetchStorefrontCatalog,
  fetchCatalogMeta: fetchStorefrontCatalogMeta,
  fetchOrderByToken: fetchStorefrontOrderByToken,
  fetchProductDetail: fetchStorefrontProductDetail,
  fetchProductPromo: fetchStorefrontProductPromo,
  getDeliveryCatalog: getStorefrontEcotrackCatalog,
  getLandingPage: getStorefrontLandingPage,
};

function publicProductEvidence(product: ShoppingAssistantProduct) {
  return {
    id: product.id,
    token: product.token,
    title: product.title,
    titleAr: product.titleAr,
    description: product.description,
    descriptionAr: product.descriptionAr,
    sku: product.sku,
    characteristics: product.characteristics,
    characteristicsAr: product.characteristicsAr,
    priceDzd: product.price,
    oldPriceDzd: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    brand: product.brand,
    category: product.category,
  };
}

function publicProductSummary(product: ShoppingAssistantProduct) {
  return {
    id: product.id,
    title: product.title,
    titleAr: product.titleAr,
    sku: product.sku,
    priceDzd: product.price,
    oldPriceDzd: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    brand: product.brand,
    category: product.category,
  };
}

export function buildShoppingAssistantTools(input: {
  request: ShoppingAssistantRequest;
  settings: StorefrontSettingsResponse;
  dependencies?: Partial<ShoppingAssistantDependencies>;
}) {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const knownProducts = new Map<number, ShoppingAssistantProduct>();
  const selectedProductIds: number[] = [];
  const initialCart = new Map(
    (input.request.context?.cartItems ?? []).map(
      (item) => [item.productId, item.quantity] as const,
    ),
  );
  const currentCart = new Map(initialCart);
  const cartProducts = new Map<number, ShoppingAssistantProduct>();
  let productCardsPromise:
    | Promise<
        Map<number, Awaited<ReturnType<typeof dependencies.fetchAssets>>['productCards'][number]>
      >
    | undefined;
  let catalogMetaPromise: ReturnType<typeof dependencies.fetchCatalogMeta> | undefined;

  const loadProductCards = () => {
    productCardsPromise ??= dependencies
      .fetchAssets()
      .then((assets) => new Map(assets.productCards.map((card) => [card.productId, card] as const)))
      .catch(() => new Map());
    return productCardsPromise;
  };

  const loadCatalogMeta = () => {
    catalogMetaPromise ??= dependencies.fetchCatalogMeta();
    return catalogMetaPromise;
  };

  const remember = (product: ShoppingAssistantProduct) => {
    knownProducts.set(product.id, product);
    return product;
  };

  const loadValidatedProducts = async (productIds: number[]) => {
    const missingIds = [...new Set(productIds)].filter(
      (productId) => !knownProducts.has(productId),
    );
    if (missingIds.length > 0) {
      const validation = await dependencies.fetchCartValidation(missingIds);
      validation.items.forEach((product) => remember(toAssistantCatalogProduct(product)));
    }
    return [...new Set(productIds)].flatMap((productId) => {
      const product = knownProducts.get(productId);
      return product ? [product] : [];
    });
  };

  const refreshValidatedProducts = async (productIds: number[]) => {
    const distinctIds = [...new Set(productIds)];
    const validation = await dependencies.fetchCartValidation(distinctIds);
    const refreshed = validation.items.map((product) =>
      remember(toAssistantCatalogProduct(product)),
    );
    return new Map(refreshed.map((product) => [product.id, product] as const));
  };

  const netChangedProductIds = (candidateCart = currentCart) =>
    [...new Set([...initialCart.keys(), ...candidateCart.keys()])].filter(
      (productId) => (initialCart.get(productId) ?? 0) !== (candidateCart.get(productId) ?? 0),
    );

  const cartMutations = (): ShoppingAssistantCartMutation[] =>
    netChangedProductIds().flatMap((productId) => {
      const initialQuantity = initialCart.get(productId) ?? 0;
      const quantity = currentCart.get(productId) ?? 0;
      if (initialQuantity === 0 && quantity > 0) {
        const product = cartProducts.get(productId) ?? knownProducts.get(productId);
        return product
          ? [shoppingAssistantCartMutationSchema.parse({ action: 'add', quantity, product })]
          : [];
      }
      if (quantity === 0) {
        return [
          shoppingAssistantCartMutationSchema.parse({ action: 'remove', productId, quantity: 0 }),
        ];
      }
      return [
        shoppingAssistantCartMutationSchema.parse({
          action: 'set_quantity',
          productId,
          quantity,
        }),
      ];
    });

  const tools = {
    read_storefront_guidance: tool({
      description:
        'Read concise Bricomaitre customer knowledge about ordering, customer-visible tracking, or delivery. This is business guidance, not current catalog or order state.',
      inputSchema: shoppingAssistantGuidanceRequestSchema,
      execute: async ({ topics }) => readShoppingAssistantGuidance(topics),
    }),
    search_catalog: tool({
      description:
        'Search and paginate the live public catalog using the Storefront’s real text matching, filters, and sorting. Prices are DZD and totals cover every matching product, not only the returned page.',
      inputSchema: shoppingAssistantCatalogSearchSchema,
      execute: async (raw) => {
        const query = shoppingAssistantCatalogSearchSchema.parse(raw);
        const [catalog, meta, cards] = await Promise.all([
          dependencies.fetchCatalog({ ...query, id: null, mongoId: null, slug: null }),
          loadCatalogMeta(),
          loadProductCards(),
        ]);
        const brands = new Map(meta.brands.map((brand) => [brand.id, brand.name] as const));
        const categories = new Map(
          meta.categories.map((category) => [category.id, category.name] as const),
        );
        const products = catalog.items.map((product) =>
          remember(
            toAssistantCatalogProduct(
              product,
              {
                brand: product.brandId ? (brands.get(product.brandId) ?? null) : null,
                category: product.categoryId ? (categories.get(product.categoryId) ?? null) : null,
              },
              cards.get(product.id),
            ),
          ),
        );
        const result = shoppingAssistantCatalogSearchResultSchema.parse({
          products,
          total: catalog.total,
          page: query.page,
          limit: query.limit,
          hasMore: query.page * query.limit < catalog.total,
        });
        return {
          currency: 'DZD' as const,
          ...result,
          products: result.products.map(publicProductSummary),
        };
      },
    }),
    inspect_products: tool({
      description:
        'Inspect exact public products in detail. Only the current_page target can return the landing-page campaign document; catalog search and ID or token targets return product facts only. Call again whenever more products need inspection.',
      inputSchema: shoppingAssistantProductLookupSchema,
      execute: async ({ targets }) => {
        const cards = await loadProductCards();
        const products: ShoppingAssistantProduct[] = [];
        const missingTargets: typeof targets = [];
        let currentCampaign: null | {
          slug: string;
          locale: 'fr' | 'ar';
          document: unknown;
        } = null;

        const inspected = await Promise.all(
          targets.map(async (target) => {
            if (target.kind === 'current_page') {
              const context = input.request.context;
              if (context?.currentProductToken) {
                const detail = await dependencies.fetchProductDetail(context.currentProductToken);
                return detail
                  ? {
                      product: toAssistantDetailProduct(detail.item, cards.get(detail.item.id)),
                      target,
                    }
                  : { product: null, target };
              }
              if (context?.currentLandingPageSlug) {
                const landing = await dependencies.getLandingPage(
                  input.request.locale,
                  context.currentLandingPageSlug,
                );
                if (landing) {
                  return {
                    product: toAssistantDetailProduct(
                      landing.product,
                      cards.get(landing.product.id),
                    ),
                    target,
                    campaign: {
                      slug: landing.slug,
                      locale: landing.locale,
                      document: landing.document,
                    },
                  };
                }
                return { product: null, target };
              }
              return { product: null, target };
            }

            const token = target.kind === 'product_id' ? String(target.productId) : target.token;
            const detail = await dependencies.fetchProductDetail(token);
            return detail
              ? {
                  product: toAssistantDetailProduct(detail.item, cards.get(detail.item.id)),
                  target,
                }
              : { product: null, target };
          }),
        );

        for (const result of inspected) {
          if (result.product) products.push(remember(result.product));
          else missingTargets.push(result.target);
          if ('campaign' in result && result.campaign) currentCampaign = result.campaign;
        }

        const distinct = [...new Map(products.map((product) => [product.id, product])).values()];
        return {
          currency: 'DZD' as const,
          products: distinct.map(publicProductEvidence),
          missingTargets,
          currentCampaign,
        };
      },
    }),
    inspect_order: tool({
      description:
        'Refresh the customer order securely linked to the current confirmation page. Returns customer-visible progress and exceptions without exposing contact details, addresses, notes, or the access token.',
      inputSchema: shoppingAssistantOrderLookupSchema,
      execute: async () => {
        const token = input.request.context?.currentOrderToken;
        if (!token) return { error: 'No customer order is linked to the current page.' };
        const order = await dependencies.fetchOrderByToken(token);
        if (!order) return { error: 'The linked order could not be found.' };
        return {
          orderId: order.id,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          tracking: getCustomerOrderTrackingState(order.inHouseStatus),
          deliveryMode: order.delivery === 1 ? 'stop_desk' : 'home',
          currency: 'DZD' as const,
          productSubtotal: order.productSubtotal,
          deliveryFee: order.deliveryFee,
          total: order.totalAmount,
          promotion: order.promoCode
            ? { code: order.promoCode, discountAmount: order.promoDiscountAmount }
            : null,
          products: order.orderProducts.map((product) => ({
            productId: product.productId,
            title: product.title,
            quantity: product.quantity,
          })),
          history: order.statusHistory.map((entry) => ({
            changedAt: entry.changedAt,
            tracking: getCustomerOrderTrackingState(entry.status),
          })),
        };
      },
    }),
    inspect_delivery_support: tool({
      description:
        'Check current delivery coverage, exact home and stop-desk fees, or public Bricomaitre contact details. Search by wilaya number/name, commune, or postal code; an empty query lists wilayas compactly.',
      inputSchema: shoppingAssistantDeliverySupportLookupSchema,
      execute: async ({ query }) =>
        storefrontDeliverySupportEvidence(
          await dependencies.getDeliveryCatalog(),
          input.settings,
          query,
        ),
    }),
    inspect_promotion: tool({
      description:
        'Validate a promotion code against exact public products using the same rules as checkout. A code may be valid for one product and invalid for another.',
      inputSchema: shoppingAssistantPromotionLookupSchema,
      execute: async ({ productIds, code }) => ({
        code,
        currency: 'DZD' as const,
        checks: await Promise.all(
          [...new Set(productIds)].map(async (productId) => ({
            productId,
            result: await dependencies.fetchProductPromo(productId, code),
          })),
        ),
      }),
    }),
    manage_cart: tool({
      description:
        'Prepare the explicit add, exact quantity, or remove changes the customer requested for the browser cart. Products and availability are validated live. Accepted net changes are applied only with the completed response.',
      inputSchema: shoppingAssistantCartManagementSchema,
      execute: async ({ operations }) => {
        const productIds = [...new Set(operations.map((operation) => operation.productId))];
        const products = await refreshValidatedProducts(productIds);
        const accepted: Array<{
          action: (typeof operations)[number]['action'];
          productId: number;
          requestedQuantity: number;
          previousQuantity: number;
          resultingQuantity: number;
        }> = [];
        const rejected: Array<(typeof operations)[number] & { reason: string }> = [];
        const seen = new Set<number>();

        for (const operation of operations) {
          const previousQuantity = currentCart.get(operation.productId) ?? 0;
          const product = products.get(operation.productId);
          let resultingQuantity = previousQuantity;
          let reason: string | null = null;

          if (seen.has(operation.productId)) reason = 'duplicate_product_operation';
          else if (operation.action === 'add') {
            const price = Number(product?.price);
            if (!product) reason = 'product_not_found';
            else if (!product.inStock) reason = 'product_out_of_stock';
            else if (product.price === null || !Number.isFinite(price) || price < 0)
              reason = 'price_unavailable';
            else {
              resultingQuantity = Math.min(20, previousQuantity + operation.quantity);
              if (resultingQuantity === previousQuantity) reason = 'quantity_limit_reached';
            }
          } else if (operation.action === 'set_quantity') {
            if (previousQuantity < 1) reason = 'product_not_in_cart';
            else if (operation.quantity === previousQuantity) reason = 'quantity_already_set';
            else if (operation.quantity > previousQuantity) {
              const price = Number(product?.price);
              if (!product || !product.inStock) reason = 'product_out_of_stock';
              else if (product.price === null || !Number.isFinite(price) || price < 0)
                reason = 'price_unavailable';
              else resultingQuantity = operation.quantity;
            } else resultingQuantity = operation.quantity;
          } else if (previousQuantity < 1) reason = 'product_not_in_cart';
          else resultingQuantity = 0;

          seen.add(operation.productId);
          if (!reason) {
            const candidate = new Map(currentCart);
            if (resultingQuantity > 0) candidate.set(operation.productId, resultingQuantity);
            else candidate.delete(operation.productId);
            if (netChangedProductIds(candidate).length > MAX_CART_PRODUCTS_CHANGED_PER_TURN)
              reason = 'turn_cart_change_limit';
          }
          if (reason) {
            rejected.push({ ...operation, reason });
            continue;
          }

          if (resultingQuantity > 0) currentCart.set(operation.productId, resultingQuantity);
          else currentCart.delete(operation.productId);
          if (product) cartProducts.set(product.id, product);
          accepted.push({
            action: operation.action,
            productId: operation.productId,
            requestedQuantity: operation.quantity,
            previousQuantity,
            resultingQuantity,
          });
        }

        return {
          accepted,
          rejected,
          cartWillChange: netChangedProductIds().length > 0,
          resultingCart: [...currentCart].map(([productId, quantity]) => ({ productId, quantity })),
        };
      },
    }),
    present_products: tool({
      description:
        'Show a useful subset of products as compact customer-facing cards. Use product IDs from catalog, product, cart, or prior conversation evidence; omit cards when prose alone is clearer.',
      inputSchema: shoppingAssistantProductSelectionSchema,
      execute: async ({ productIds }) => {
        await loadValidatedProducts(productIds);
        const accepted = [...new Set(productIds)].filter((productId) =>
          knownProducts.has(productId),
        );
        selectedProductIds.splice(0, selectedProductIds.length, ...accepted);
        return {
          selectedProducts: accepted.map((productId) =>
            publicProductSummary(knownProducts.get(productId)!),
          ),
          rejectedProductIds: productIds.filter((productId) => !knownProducts.has(productId)),
        };
      },
    }),
  };

  return {
    tools,
    result() {
      return {
        products: selectedProductIds.flatMap((productId) => {
          const product = knownProducts.get(productId);
          return product ? [product] : [];
        }),
        cartMutations: cartMutations(),
      };
    },
  };
}
