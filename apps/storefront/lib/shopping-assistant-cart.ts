import type { ShoppingAssistantCartMutation } from '@bric/storefront-core/shopping-assistant-contracts';

import type { Locale } from '@/i18n/config';
import { addCartItem, removeCartItem, updateCartItemQuantity, type CartItem } from '@/lib/cart';

type ShoppingAssistantCartChange = {
  mutation: ShoppingAssistantCartMutation;
  previousQuantity: number;
  resultingQuantity: number;
};

function productTitle(mutation: ShoppingAssistantCartMutation, locale: Locale) {
  const product = mutation.product;
  return locale === 'ar' && product.titleAr?.trim() ? product.titleAr.trim() : product.title;
}

export function applyShoppingAssistantCartMutations(
  current: CartItem[],
  mutations: ShoppingAssistantCartMutation[],
  locale: Locale,
) {
  let items = current;
  const changes: ShoppingAssistantCartChange[] = [];

  for (const mutation of mutations) {
    const product = mutation.product;
    const previousQuantity = items.find((item) => item.productId === product.id)?.quantity ?? 0;
    let next = items;

    if (mutation.action === 'add') {
      const unitPrice = Number(product.price);
      if (
        mutation.quantity < 1 ||
        !product.inStock ||
        product.price === null ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      )
        continue;
      next = addCartItem(items, {
        productId: product.id,
        token: product.token,
        title: productTitle(mutation, locale),
        imageUrl: product.imageUrl,
        unitPrice,
        quantity: mutation.quantity,
        availabilityStatus: product.availabilityStatus,
      });
    } else if (mutation.action === 'set_quantity') {
      if (previousQuantity < 1 || mutation.quantity < 1) continue;
      next = updateCartItemQuantity(items, product.id, mutation.quantity);
    } else {
      if (previousQuantity < 1 || mutation.quantity !== 0) continue;
      next = removeCartItem(items, product.id);
    }

    const resultingQuantity = next.find((item) => item.productId === product.id)?.quantity ?? 0;
    if (resultingQuantity === previousQuantity) continue;
    items = next;
    changes.push({ mutation, previousQuantity, resultingQuantity });
  }

  return { items, changes, changed: changes.length > 0 };
}
