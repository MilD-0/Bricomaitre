import type { getDb } from '@bric/db/client';
import { normalizePromoCode, productPayloadSchema, type ProductPromoCodePayload } from './products';
import { resolveUniqueSlug } from './slug';

type Database = Pick<ReturnType<typeof getDb>, 'query'>;

async function resolveProductSlug(
  db: Database,
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  return resolveUniqueSlug(data.slug ?? data.title, async (slug) => {
    const [existing, historical] = await Promise.all([
      db.query.products.findFirst({
        columns: { id: true },
        where: (productsTable, helpers) =>
          currentId == null
            ? helpers.eq(productsTable.slug, slug)
            : helpers.and(
                helpers.eq(productsTable.slug, slug),
                helpers.ne(productsTable.id, currentId),
              ),
      }),
      db.query.productSlugHistory.findFirst({
        columns: { productId: true },
        where: (historyTable, helpers) =>
          currentId == null
            ? helpers.eq(historyTable.slug, slug)
            : helpers.and(
                helpers.eq(historyTable.slug, slug),
                helpers.ne(historyTable.productId, currentId),
              ),
      }),
    ]);

    return Boolean(existing || historical);
  });
}

export async function toProductMutationValues(
  db: Database,
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const { promoCodes, ...productValues } = data;
  void promoCodes;
  return {
    ...productValues,
    slug: await resolveProductSlug(db, data, currentId),
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
