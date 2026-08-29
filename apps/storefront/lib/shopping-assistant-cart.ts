import type { ShoppingAssistantCartMutation } from '@bric/storefront-core/shopping-assistant-contracts';

import type { Locale } from '@/i18n/config';
import { addCartItem, removeCartItem, updateCartItemQuantity, type CartItem } from '@/lib/cart';

type ShoppingAssistantCartChange = {
  mutation: ShoppingAssistantCartMutation;
  productId: number;
  productToken: string;
  unitPrice: number;
  previousQuantity: number;
  resultingQuantity: number;
};

function productTitle(
  mutation: Extract<ShoppingAssistantCartMutation, { action: 'add' }>,
  locale: Locale,
) {
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
    const productId = mutation.action === 'add' ? mutation.product.id : mutation.productId;
    const previousItem = items.find((item) => item.productId === productId);
    const previousQuantity = previousItem?.quantity ?? 0;
    let next = items;

    if (mutation.action === 'add') {
      const product = mutation.product;
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
      next = updateCartItemQuantity(items, mutation.productId, mutation.quantity);
    } else {
      if (previousQuantity < 1 || mutation.quantity !== 0) continue;
      next = removeCartItem(items, mutation.productId);
    }

    const resultingItem = next.find((item) => item.productId === productId);
    const resultingQuantity = resultingItem?.quantity ?? 0;
    if (resultingQuantity === previousQuantity) continue;
    items = next;
    const item = resultingItem ?? previousItem;
    if (!item) continue;
    changes.push({
      mutation,
      productId,
      productToken: item.token,
      unitPrice: item.unitPrice,
      previousQuantity,
      resultingQuantity,
    });
  }

  return { items, changes, changed: changes.length > 0 };
}
