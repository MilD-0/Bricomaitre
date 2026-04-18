export type CartProductSnapshot = {
  _id: string;
  id: number | null;
  slug: string;
  title: string;
  title_ar: string;
  summary: string;
  summary_ar: string;
  images: string[];
  price: number;
  OldPrice: number | null;
  oldPrice: number | null;
  stock: number;
  inStock: boolean;
  availabilityStatus: string;
  updatedAt: string | null;
};

export function toCartProductSnapshot(product: {
  _id: string | number;
  id?: number | string | null;
  slug?: string | null;
  title?: string | null;
  title_ar?: string | null;
  summary?: string | null;
  summary_ar?: string | null;
  images?: string[] | null;
  price?: number | string | null;
  OldPrice?: number | string | null;
  oldPrice?: number | string | null;
  stock?: number | null;
  inStock?: boolean | null;
  availabilityStatus?: string | null;
  updatedAt?: string | null;
}): CartProductSnapshot {
  const price = typeof product.price === "number" ? product.price : Number(product.price ?? 0);
  const oldPriceRaw = product.oldPrice ?? product.OldPrice;
  const oldPrice = oldPriceRaw == null ? null : Number(oldPriceRaw);
  const id =
    typeof product.id === "number"
      ? product.id
      : typeof product.id === "string" && /^-?[0-9]+$/.test(product.id.trim())
        ? Number(product.id)
        : null;

  return {
    _id: String(product._id),
    id,
    slug: product.slug ?? String(product._id),
    title: product.title ?? "",
    title_ar: product.title_ar ?? "",
    summary: product.summary ?? "",
    summary_ar: product.summary_ar ?? "",
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    price: Number.isFinite(price) ? price : 0,
    OldPrice: oldPrice,
    oldPrice,
    stock: typeof product.stock === "number" ? product.stock : 0,
    inStock: Boolean(product.inStock),
    availabilityStatus: product.availabilityStatus ?? "",
    updatedAt: product.updatedAt ?? null,
  };
}

export function mergeCartProductSnapshots(
  current: Record<string, CartProductSnapshot>,
  products: Array<Parameters<typeof toCartProductSnapshot>[0]>,
) {
  if (products.length === 0) {
    return current;
  }

  const next = { ...current };
  let changed = false;

  for (const product of products) {
    const snapshot = toCartProductSnapshot(product);
    const previous = current[snapshot._id];

    if (
      previous
      && previous.slug === snapshot.slug
      && previous.id === snapshot.id
      && previous.title === snapshot.title
      && previous.title_ar === snapshot.title_ar
      && previous.summary === snapshot.summary
      && previous.summary_ar === snapshot.summary_ar
      && previous.price === snapshot.price
      && previous.OldPrice === snapshot.OldPrice
      && previous.oldPrice === snapshot.oldPrice
      && previous.stock === snapshot.stock
      && previous.inStock === snapshot.inStock
      && previous.availabilityStatus === snapshot.availabilityStatus
      && previous.updatedAt === snapshot.updatedAt
      && previous.images.length === snapshot.images.length
      && previous.images.every((image, index) => image === snapshot.images[index])
    ) {
      continue;
    }

    next[snapshot._id] = snapshot;
    changed = true;
  }

  return changed ? next : current;
}

export function buildCartProductSummary(
  cartProducts: string[],
  snapshots: Record<string, CartProductSnapshot>,
) {
  const quantityById: Record<string, number> = {};

  for (const productId of cartProducts) {
    quantityById[productId] = (quantityById[productId] ?? 0) + 1;
  }

  const items = Object.entries(quantityById).map(([productId, quantity]) => {
    const snapshot = snapshots[productId] ?? null;
    const unitPrice = snapshot?.price ?? 0;

    return {
      productId,
      quantity,
      product: snapshot,
      lineTotal: unitPrice * quantity,
      available: Boolean(snapshot),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    items,
    subtotal,
    quantityById,
  };
}
