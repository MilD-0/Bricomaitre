export type CartProductSnapshot = {
  _id: string;
  id: number | null;
  mongo_id: string | null;
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
  _id?: string | number | null;
  id?: number | string | null;
  mongo_id?: string | null;
  mongoId?: string | null;
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
  const id = readNumericProductId(product);
  const canonicalId = getCanonicalProductId(product) ?? String(product._id ?? "");
  const mongoId = product.mongo_id?.trim() || product.mongoId?.trim() || null;

  return {
    _id: canonicalId,
    id,
    mongo_id: mongoId,
    slug: product.slug ?? canonicalId,
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

function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

function readNumericProductId(product: {
  id?: number | string | null;
  _id?: string | number | null;
}) {
  if (typeof product.id === "number" && Number.isInteger(product.id) && product.id > 0) {
    return product.id;
  }

  if (typeof product.id === "string" && /^\d+$/.test(product.id.trim())) {
    const parsed = Number.parseInt(product.id.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  if (typeof product._id === "number" && Number.isInteger(product._id) && product._id > 0) {
    return product._id;
  }

  if (typeof product._id === "string" && /^\d+$/.test(product._id.trim())) {
    const parsed = Number.parseInt(product._id.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function getCanonicalProductId(product: {
  id?: number | string | null;
  _id?: string | number | null;
} | null | undefined) {
  if (!product) {
    return null;
  }

  const id = readNumericProductId(product);
  return id == null ? null : String(id);
}

export function getProductReferenceTokens(product: {
  id?: number | string | null;
  _id?: string | number | null;
  mongo_id?: string | null;
  mongoId?: string | null;
  slug?: string | null;
} | null | undefined) {
  if (!product) {
    return [];
  }

  return [
    getCanonicalProductId(product),
    product._id == null ? null : String(product._id),
    product.id == null ? null : String(product.id),
    product.mongo_id,
    product.mongoId,
    product.slug,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function normalizeCartProductSnapshots(
  snapshots: Record<string, CartProductSnapshot> | null | undefined,
) {
  const next: Record<string, CartProductSnapshot> = {};

  for (const [key, snapshot] of Object.entries(snapshots ?? {})) {
    const normalized = toCartProductSnapshot({
      ...snapshot,
      mongo_id: snapshot.mongo_id ?? (isMongoObjectId(key) ? key : null),
    });
    next[normalized._id] = normalized;
    if (key !== normalized._id && !next[key]) {
      next[key] = normalized;
    }
  }

  return next;
}

export function findProductSnapshotByToken(
  snapshots: Record<string, CartProductSnapshot>,
  token: string | number | null | undefined,
) {
  const normalizedToken = token == null ? "" : String(token).trim();
  if (!normalizedToken) {
    return null;
  }

  const direct = snapshots[normalizedToken];
  if (direct) {
    return direct;
  }

  return Object.values(snapshots).find((snapshot) =>
    getProductReferenceTokens(snapshot).includes(normalizedToken)) ?? null;
}

export function canonicalizeCartProducts(
  cartProducts: Array<string | number>,
  products: Array<{
    id?: number | string | null;
    _id?: string | number | null;
    mongo_id?: string | null;
    mongoId?: string | null;
    slug?: string | null;
  } | null | undefined>,
) {
  const lookup = new Map<string, string>();
  for (const product of products) {
    const canonicalId = getCanonicalProductId(product);
    if (!canonicalId) {
      continue;
    }

    for (const token of getProductReferenceTokens(product)) {
      lookup.set(token, canonicalId);
    }
  }

  return cartProducts
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => lookup.get(value) ?? value);
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
      && previous.mongo_id === snapshot.mongo_id
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
    const snapshot = findProductSnapshotByToken(snapshots, productId);
    const canonicalId = snapshot?._id ?? productId;
    quantityById[canonicalId] = (quantityById[canonicalId] ?? 0) + 1;
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

export function buildCartTrackingProducts(
  items: ReturnType<typeof buildCartProductSummary>["items"],
) {
  return items.flatMap((item) =>
    item.product
      ? [{ ...item.product, quantity: item.quantity }]
      : [],
  );
}

export function withTrackingPrice<T extends { price?: number | string | null }>(
  product: T,
  effectivePrice: number | string | null | undefined,
) {
  const price = typeof effectivePrice === "number"
    ? effectivePrice
    : Number(effectivePrice ?? product.price ?? 0);
  return {
    ...product,
    price: Number.isFinite(price) ? price : Number(product.price ?? 0),
  };
}
