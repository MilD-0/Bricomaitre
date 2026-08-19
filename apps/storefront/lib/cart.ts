import { z } from 'zod';

const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  token: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  imageUrl: z.string().nullable(),
  unitPrice: z.number().min(0),
  quantity: z.number().int().min(1).max(20),
  availabilityStatus: z.string(),
});

const cartSchema = z.array(cartItemSchema).max(50);
export type CartItem = z.infer<typeof cartItemSchema>;

export const STOREFRONT_CART_KEY = 'bric:cart:v1';

export function addCartItem(current: unknown, item: CartItem) {
  const parsed = cartSchema.safeParse(current);
  const cart = parsed.success ? parsed.data : [];
  const existing = cart.find((entry) => entry.productId === item.productId);

  if (!existing) {
    return [...cart, item];
  }

  return cart.map((entry) =>
    entry.productId === item.productId
      ? { ...entry, ...item, quantity: Math.min(20, entry.quantity + item.quantity) }
      : entry,
  );
}

export function readCart(storage: Pick<Storage, 'getItem'>) {
  try {
    const raw = storage.getItem(STOREFRONT_CART_KEY);
    return raw ? cartSchema.parse(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeCart(storage: Pick<Storage, 'setItem'>, cart: CartItem[]) {
  storage.setItem(STOREFRONT_CART_KEY, JSON.stringify(cartSchema.parse(cart)));
}

export function updateCartItemQuantity(current: unknown, productId: number, quantity: number) {
  const parsed = cartSchema.safeParse(current);
  if (!parsed.success) return [];
  if (quantity <= 0) return parsed.data.filter((item) => item.productId !== productId);
  return parsed.data.map((item) =>
    item.productId === productId
      ? { ...item, quantity: Math.min(20, Math.max(1, Math.trunc(quantity))) }
      : item,
  );
}

export function removeCartItem(current: unknown, productId: number) {
  const parsed = cartSchema.safeParse(current);
  return parsed.success ? parsed.data.filter((item) => item.productId !== productId) : [];
}

export function getCartItemCount(current: unknown) {
  const parsed = cartSchema.safeParse(current);
  return parsed.success ? parsed.data.reduce((total, item) => total + item.quantity, 0) : 0;
}

export function getCartSubtotal(current: unknown) {
  const parsed = cartSchema.safeParse(current);
  return parsed.success
    ? parsed.data.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
    : 0;
}

export async function reconcileCartWithCatalog(current: CartItem[], fetcher: typeof fetch = fetch) {
  if (current.length === 0) {
    return {
      items: [],
      removedProductIds: [],
      priceChangedProductIds: [],
      changed: false,
      requiresReview: false,
    };
  }
  const response = await fetcher('/api/cart/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productIds: current.map((item) => item.productId) }),
  });
  if (!response.ok) throw new Error('Cart validation is unavailable.');
  const payload = (await response.json()) as {
    items?: Array<{
      id: number;
      slug: string | null;
      title: string;
      price: string | null;
      inStock: boolean;
      availabilityStatus: string;
      images: string[];
    }>;
  };
  const products = new Map((payload.items ?? []).map((product) => [product.id, product]));
  const removedProductIds: number[] = [];
  const priceChangedProductIds: number[] = [];
  const items = current.flatMap((item) => {
    const product = products.get(item.productId);
    const unitPrice = Number(product?.price);
    if (
      !product?.inStock ||
      product.price === null ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      removedProductIds.push(item.productId);
      return [];
    }
    if (unitPrice !== item.unitPrice) priceChangedProductIds.push(item.productId);
    return [
      {
        ...item,
        token: product.slug ?? String(product.id),
        title: product.title,
        unitPrice,
        imageUrl: product.images[0] ?? null,
        availabilityStatus: product.availabilityStatus,
      },
    ];
  });

  return {
    items,
    removedProductIds,
    priceChangedProductIds,
    changed: JSON.stringify(items) !== JSON.stringify(current),
    requiresReview: removedProductIds.length > 0 || priceChangedProductIds.length > 0,
  };
}
