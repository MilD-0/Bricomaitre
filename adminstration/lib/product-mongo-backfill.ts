export type MongoProductSource = {
  _id: string;
  title: string;
};

export type PostgresProductBackfillRow = {
  id: number;
  title: string;
  mongoId: string | null;
};

export type ProductMongoBackfillMatch = {
  productId: number;
  productTitle: string;
  mongoId: string;
  mongoTitle: string;
  existingMongoId: string | null;
};

export type ProductMongoBackfillPlan = {
  matches: ProductMongoBackfillMatch[];
  unmatchedPostgres: PostgresProductBackfillRow[];
  unmatchedMongo: MongoProductSource[];
  duplicateMongoTitles: Array<{ normalizedTitle: string; items: MongoProductSource[] }>;
};

export function normalizeProductTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function buildMongoProductTitleIndex(mongoProducts: MongoProductSource[]) {
  const grouped = new Map<string, MongoProductSource[]>();

  for (const product of mongoProducts) {
    const normalizedTitle = normalizeProductTitle(product.title);

    if (!normalizedTitle) {
      continue;
    }

    const current = grouped.get(normalizedTitle) ?? [];
    current.push(product);
    grouped.set(normalizedTitle, current);
  }

  const uniqueByTitle = new Map<string, MongoProductSource>();
  const duplicateMongoTitles: Array<{ normalizedTitle: string; items: MongoProductSource[] }> = [];

  for (const [normalizedTitle, items] of grouped) {
    if (items.length === 1) {
      uniqueByTitle.set(normalizedTitle, items[0]);
      continue;
    }

    duplicateMongoTitles.push({ normalizedTitle, items });
  }

  return { uniqueByTitle, duplicateMongoTitles };
}

export function planProductMongoBackfill(
  postgresProducts: PostgresProductBackfillRow[],
  mongoProducts: MongoProductSource[],
): ProductMongoBackfillPlan {
  const { uniqueByTitle, duplicateMongoTitles } = buildMongoProductTitleIndex(mongoProducts);
  const matches: ProductMongoBackfillMatch[] = [];
  const unmatchedPostgres: PostgresProductBackfillRow[] = [];
  const matchedMongoIds = new Set<string>();

  for (const product of postgresProducts) {
    const normalizedTitle = normalizeProductTitle(product.title);
    const mongoProduct = uniqueByTitle.get(normalizedTitle);

    if (!mongoProduct) {
      unmatchedPostgres.push(product);
      continue;
    }

    matchedMongoIds.add(mongoProduct._id);
    matches.push({
      productId: product.id,
      productTitle: product.title,
      mongoId: mongoProduct._id,
      mongoTitle: mongoProduct.title,
      existingMongoId: product.mongoId,
    });
  }

  const unmatchedMongo = mongoProducts.filter((product) => !matchedMongoIds.has(product._id));

  return {
    matches,
    unmatchedPostgres,
    unmatchedMongo,
    duplicateMongoTitles,
  };
}
