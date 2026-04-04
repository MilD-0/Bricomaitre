import { createSlugAssigner, slugify } from './slug';

export type MongoProductDocument = {
  _id?: string;
  title?: string;
  description?: string;
  title_ar?: string;
  description_ar?: string;
  price?: number;
  OldPrice?: number;
  purchase_price?: number;
  SKU?: string;
  brand?: string;
  category?: string;
  stock?: number;
  images?: string[];
  unitsSold?: number;
  units_sold?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MongoNamedDocument = {
  _id?: string;
  name?: string;
};

export type MongoCategoryDocument = MongoNamedDocument & {
  name_en?: string;
  name_ar?: string;
  image?: string;
  parent?: string;
  properties?: unknown[];
  featured?: boolean;
};

export type MongoBrandDocument = MongoNamedDocument & {
  image?: string;
  featured?: boolean;
};

export type MongoSecondaryStockDocument = {
  productId?: string;
  barcode?: string;
  secondaryStock?: number;
};

export type ImportedProductRow = {
  mongoId: string | null;
  title: string;
  slug: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  sku: string | null;
  barcode: string | null;
  price: string;
  oldPrice: string | null;
  purchasePrice: string | null;
  active: boolean;
  inStock: boolean;
  availabilityStatus: 'in_stock' | 'out_of_stock';
  unitsSold: number;
  inventoryQuantity: number;
  brandId: number | null;
  categoryId: number | null;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ProductImportLookups = {
  brandIdByMongoId?: Map<string, number>;
  categoryIdByMongoId?: Map<string, number>;
};

export type ImportedBrandRow = {
  name: string;
  slug: string;
  image: string | null;
  isActive: boolean;
  featured: boolean;
  createdBy: null;
  createdByName: null;
  updatedBy: null;
  updatedByName: null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportedCategoryRow = {
  name: string;
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  image: string | null;
  isActive: boolean;
  parentId: number | null;
  properties: unknown[];
  featured: boolean;
  createdBy: null;
  createdByName: null;
  updatedBy: null;
  updatedByName: null;
  createdAt: Date;
  updatedAt: Date;
};

function trimNullableText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readMongoId(value: unknown) {
  const directValue = trimNullableText(value);

  if (directValue) {
    return directValue;
  }

  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return trimNullableText((value as { $oid?: unknown }).$oid);
  }

  return null;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const MONEY_ABS_LIMIT = 10_000_000_000;

function isSupportedMoneyValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < MONEY_ABS_LIMIT;
}

function toMoneyString(value: unknown) {
  const number = isSupportedMoneyValue(value) ? Number(value) : 1;
  return number.toFixed(2);
}

function toOptionalMoneyString(value: unknown) {
  if (!isSupportedMoneyValue(value)) {
    return null;
  }

  return Number(value).toFixed(2);
}

function toDate(value: unknown) {
  if (typeof value !== 'string') {
    return new Date();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function normalizeImportName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function slugifyImportName(value: string) {
  return slugify(value);
}

export function mapMongoBrandToCurrentSchema(brand: MongoBrandDocument): ImportedBrandRow | null {
  const name = trimNullableText(brand.name);

  if (!name) {
    return null;
  }

  return {
    name,
    slug: slugifyImportName(name),
    image: trimNullableText(brand.image),
    isActive: true,
    featured: Boolean(brand.featured),
    createdBy: null,
    createdByName: null,
    updatedBy: null,
    updatedByName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function mapMongoCategoryToCurrentSchema(
  category: MongoCategoryDocument,
  parentId: number | null,
): ImportedCategoryRow | null {
  const name = trimNullableText(category.name);

  if (!name) {
    return null;
  }

  return {
    name,
    slug: slugifyImportName(name),
    nameEn: trimNullableText(category.name_en),
    nameAr: trimNullableText(category.name_ar),
    image: trimNullableText(category.image),
    isActive: true,
    parentId,
    properties: Array.isArray(category.properties) ? category.properties : [],
    featured: Boolean(category.featured),
    createdBy: null,
    createdByName: null,
    updatedBy: null,
    updatedByName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function importMongoBrands(
  mongoBrands: MongoBrandDocument[],
  insertBrand: (row: ImportedBrandRow) => Promise<number>,
) {
  const brandIdByMongoId = new Map<string, number>();
  const assignSlug = createSlugAssigner();

  for (const mongoBrand of mongoBrands) {
    const mongoId = readMongoId(mongoBrand._id);
    const row = mapMongoBrandToCurrentSchema(mongoBrand);

    if (!mongoId || !row) {
      continue;
    }

    const insertedId = await insertBrand({
      ...row,
      slug: assignSlug(row.name),
    });
    brandIdByMongoId.set(mongoId, insertedId);
  }

  return brandIdByMongoId;
}

export async function importMongoCategories(
  mongoCategories: MongoCategoryDocument[],
  insertCategory: (row: ImportedCategoryRow) => Promise<number>,
) {
  const pending = [...mongoCategories];
  const categoryIdByMongoId = new Map<string, number>();
  const assignSlug = createSlugAssigner();
  let progressed = true;

  while (pending.length > 0 && progressed) {
    progressed = false;

    for (let index = 0; index < pending.length; index += 1) {
      const mongoCategory = pending[index];
      const mongoId = readMongoId(mongoCategory._id);
      const parentMongoId = readMongoId(mongoCategory.parent);

      if (parentMongoId && !categoryIdByMongoId.has(parentMongoId)) {
        continue;
      }

      const row = mapMongoCategoryToCurrentSchema(mongoCategory, parentMongoId ? (categoryIdByMongoId.get(parentMongoId) ?? null) : null);

      pending.splice(index, 1);
      index -= 1;
      progressed = true;

      if (!mongoId || !row) {
        continue;
      }

      const insertedId = await insertCategory({
        ...row,
        slug: assignSlug(row.name),
      });
      categoryIdByMongoId.set(mongoId, insertedId);
    }
  }

  for (const mongoCategory of pending) {
    const mongoId = readMongoId(mongoCategory._id);
    const row = mapMongoCategoryToCurrentSchema(mongoCategory, null);

    if (!mongoId || !row) {
      continue;
    }

    const insertedId = await insertCategory({
      ...row,
      slug: assignSlug(row.name),
    });
    categoryIdByMongoId.set(mongoId, insertedId);
  }

  return categoryIdByMongoId;
}

export function mapMongoProductToCurrentSchema(
  product: MongoProductDocument,
  lookups: ProductImportLookups = {},
): ImportedProductRow | null {
  const title = trimNullableText(product.title);

  if (!title) {
    return null;
  }

  const productMongoId = readMongoId(product._id);
  const unitsSold = Math.max(0, Math.trunc(toFiniteNumber(product.units_sold ?? product.unitsSold, 0)));
  const images = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    : [];

  return {
    mongoId: productMongoId,
    title,
    slug: slugifyImportName(title),
    titleAr: trimNullableText(product.title_ar),
    description: trimNullableText(product.description),
    descriptionAr: trimNullableText(product.description_ar),
    sku: trimNullableText(product.SKU),
    barcode: null,
    price: toMoneyString(product.price),
    oldPrice: toOptionalMoneyString(product.OldPrice),
    purchasePrice: toOptionalMoneyString(product.purchase_price),
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    unitsSold,
    inventoryQuantity: 0,
    brandId: readMongoId(product.brand) ? (lookups.brandIdByMongoId?.get(readMongoId(product.brand)!) ?? null) : null,
    categoryId: readMongoId(product.category) ? (lookups.categoryIdByMongoId?.get(readMongoId(product.category)!) ?? null) : null,
    images,
    createdAt: toDate(product.createdAt),
    updatedAt: toDate(product.updatedAt),
  };
}

export function parseMongoCollectionExport<T extends object>(input: string) {
  const raw = JSON.parse(input) as unknown;
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && 'items' in raw && Array.isArray((raw as { items: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;

  if (!items) {
    throw new Error('Expected a JSON array or an object with an "items" array.');
  }

  return items.filter((item): item is T => typeof item === 'object' && item !== null);
}
