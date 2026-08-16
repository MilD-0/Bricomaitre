import { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { normalizePromoCode, productPayloadSchema, type ProductPromoCodePayload } from './products';
import { resolveUniqueSlug } from './slug';

async function resolveProductSlug(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const db = getDb() as {
    query?: {
      products?: {
        findFirst?: (input: unknown) => Promise<{ id: number } | undefined>;
      };
    };
  };

  if (!db.query?.products?.findFirst) {
    return resolveUniqueSlug(data.slug ?? data.title, async () => false);
  }

  return resolveUniqueSlug(data.slug ?? data.title, async (slug) => {
    const existing = await db.query?.products?.findFirst?.({
      columns: { id: true },
      where: (
        productsTable: typeof products,
        helpers: {
          and: typeof import('drizzle-orm').and;
          eq: typeof import('drizzle-orm').eq;
          ne: typeof import('drizzle-orm').ne;
        },
      ) =>
        currentId == null
          ? helpers.eq(productsTable.slug, slug)
          : helpers.and(
              helpers.eq(productsTable.slug, slug),
              helpers.ne(productsTable.id, currentId),
            ),
    });

    return Boolean(existing);
  });
}

export async function toProductMutationValues(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const { promoCodes, ...productValues } = data;
  void promoCodes;
  return {
    ...productValues,
    slug: await resolveProductSlug(data, currentId),
    price: data.price.toFixed(2),
    oldPrice: data.oldPrice == null ? null : data.oldPrice.toFixed(2),
    purchasePrice: data.purchasePrice == null ? null : data.purchasePrice.toFixed(2),
  };
}

function toPromoDate(value: string | null) {
  return value === null ? null : new Date(value);
}

export function toProductPromoRows(productId: number, promoCodes: ProductPromoCodePayload[]) {
  const now = new Date();

  return promoCodes.map((promo) => ({
    productId,
    code: promo.code,
    normalizedCode: normalizePromoCode(promo.code),
    promoPrice: promo.promoPrice.toFixed(2),
    active: promo.active,
    startsAt: toPromoDate(promo.startsAt),
    endsAt: toPromoDate(promo.endsAt),
    createdAt: now,
    updatedAt: now,
  }));
}
