import {
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  isConfirmedLifecycleStatus,
} from './orders';
import { createSlugAssigner, slugify } from './slug';

export type MongoExtendedId = string | { $oid?: unknown } | null;
export type MongoExtendedDate = string | { $date?: unknown } | null;

export type MongoProductDocument = {
  _id?: MongoExtendedId;
  title?: string;
  description?: string;
  title_ar?: string;
  description_ar?: string;
  price?: number;
  OldPrice?: number;
  purchase_price?: number;
  SKU?: string;
  brand?: MongoExtendedId;
  category?: MongoExtendedId;
  stock?: number;
  images?: string[];
  unitsSold?: number;
  units_sold?: number;
  createdAt?: MongoExtendedDate;
  updatedAt?: MongoExtendedDate;
};

export type MongoNamedDocument = {
  _id?: MongoExtendedId;
  name?: string;
};

export type MongoCategoryDocument = MongoNamedDocument & {
  name_en?: string;
  name_ar?: string;
  image?: string;
  parent?: MongoExtendedId;
  properties?: unknown[];
  featured?: boolean;
  createdAt?: MongoExtendedDate;
  updatedAt?: MongoExtendedDate;
};

export type MongoBrandDocument = MongoNamedDocument & {
  image?: string;
  featured?: boolean;
  createdAt?: MongoExtendedDate;
  updatedAt?: MongoExtendedDate;
};

export type MongoOrderDocument = {
  _id?: MongoExtendedId;
  firstName?: unknown;
  lastName?: unknown;
  state?: unknown;
  city?: unknown;
  homeAddress?: unknown;
  email?: unknown;
  phoneNumber1?: unknown;
  phoneNumber2?: unknown;
  cartProducts?: unknown;
  delivery?: unknown;
  del_pr?: unknown;
  price?: unknown;
  note?: unknown;
  confirmed?: unknown;
  noAnswerCount?: unknown;
  createdAt?: MongoExtendedDate;
  updatedAt?: MongoExtendedDate;
  ecotrackStatus?: unknown;
  ecotrackCurrentStatus?: unknown;
  ecotrackLastSync?: MongoExtendedDate;
  ecotrackReference?: unknown;
  ecotrackTrackingNumber?: unknown;
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

export type ImportedBrandRow = {
  mongoId: string | null;
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
  mongoId: string | null;
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

export type ImportedOrderRow = {
  mongoId: string | null;
  firstName: string | null;
  lastName: string | null;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
  email: string | null;
  phoneNumber1: string;
  phoneNumber2: string | null;
  cartProducts: string[];
  delivery: 0 | 1;
  delPr: string | null;
  price: string | null;
  note: string | null;
  confirmed: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  noAnswerCount: number;
  confirmedBy: null;
  confirmedByName: null;
  confirmedAt: Date | null;
  archivedAt: Date | null;
  ecotrackStatus: string | null;
  ecotrackStatusLastUpdate: Date | null;
  ecotrackStatusData: Record<string, unknown> | null;
  ecotrackReference: string | null;
  ecotrackTrackingNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductImportLookups = {
  brandIdByMongoId?: Map<string, number>;
  categoryIdByMongoId?: Map<string, number>;
};

export type OrderImportLookups = {
  productIdByMongoId: Map<string, number>;
  importNow: Date;
};

export type ProductImportDiagnostics = {
  usedPriceFallback: boolean;
  oldPriceDropped: boolean;
  purchasePriceDropped: boolean;
};

export type OrderImportIssue = {
  code:
    | 'missing_phone'
    | 'unresolved_state'
    | 'unmatched_cart_product';
  message: string;
  value?: string | null;
};

export type OrderImportResult =
  | {
      row: ImportedOrderRow;
      warnings: OrderImportIssue[];
      errors: [];
    }
  | {
      row: null;
      warnings: OrderImportIssue[];
      errors: OrderImportIssue[];
    };

const WILAYA_CODE_BY_NAME = {
  Adrar: 1,
  Chlef: 2,
  Laghouat: 3,
  'Oum El Bouaghi': 4,
  Batna: 5,
  'Béjaïa': 6,
  Biskra: 7,
  'Béchar': 8,
  Blida: 9,
  'Bouïra': 10,
  Tamanrasset: 11,
  'Tébessa': 12,
  Tebessa: 12,
  Tlemcen: 13,
  Tiaret: 14,
  'Tizi Ouzou': 15,
  Alger: 16,
  Djelfa: 17,
  Jijel: 18,
  'Sétif': 19,
  'Saïda': 20,
  Skikda: 21,
  'Sidi Bel Abbès': 22,
  Annaba: 23,
  Guelma: 24,
  Constantine: 25,
  'Médéa': 26,
  Mostaganem: 27,
  Msila: 28,
  Mascara: 29,
  Ouargla: 30,
  Oran: 31,
  'El Bayadh': 32,
  Illizi: 33,
  'Bordj Bou Arreridj': 34,
  'Boumerdès': 35,
  'El Tarf': 36,
  Tindouf: 37,
  Tissemsilt: 38,
  'El Oued': 39,
  Khenchela: 40,
  'Souk Ahras': 41,
  Tipaza: 42,
  Mila: 43,
  'Aïn Defla': 44,
  'Naâma': 45,
  'Aïn Témouchent': 46,
  'Ghardaïa': 47,
  Relizane: 48,
  Timimoun: 49,
  'Bordj Badji Mokhtar': 50,
  'Ouled Djellal': 51,
  'Béni Abbès': 52,
  'In Salah': 53,
  'In Guezzam': 54,
  Touggourt: 55,
  Djanet: 56,
  'El Mghair': 57,
  'El Meniaa': 58,
} as const satisfies Record<string, number>;

const WILAYA_MATCHES = new Map<string, number>();
for (const [name, code] of Object.entries(WILAYA_CODE_BY_NAME)) {
  WILAYA_MATCHES.set(normalizeStateKey(name), code);
}

const MONEY_ABS_LIMIT = 10_000_000_000;
const ARCHIVE_CUTOFF = new Date('2026-01-01T00:00:00.000Z');

function trimNullableText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimNullableScalarText(value: unknown) {
  if (typeof value === 'string') {
    return trimNullableText(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
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

export function readMongoDate(value: unknown, fallback = new Date()) {
  const directValue = trimNullableText(value);
  const raw = directValue
    ?? (typeof value === 'object' && value !== null && '$date' in value
      ? trimNullableScalarText((value as { $date?: unknown }).$date)
      : null);

  if (!raw) {
    return fallback;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function isSupportedMoneyValue(value: unknown) {
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

export function normalizeImportName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeStateKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

function levenshteinDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let index = 0; index <= right.length; index += 1) {
    rows[0][index] = index;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + substitutionCost,
      );
    }
  }

  return rows[left.length][right.length];
}

export function resolveWilayaCode(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 58) {
    return value;
  }

  const text = trimNullableScalarText(value);
  if (!text) {
    return null;
  }

  const directCode = WILAYA_CODE_BY_NAME[text as keyof typeof WILAYA_CODE_BY_NAME];
  if (directCode) {
    return directCode;
  }

  const normalized = normalizeStateKey(text);
  const exactNormalizedCode = WILAYA_MATCHES.get(normalized);
  if (exactNormalizedCode) {
    return exactNormalizedCode;
  }

  let bestMatch: { distance: number; code: number } | null = null;

  for (const [candidate, code] of WILAYA_MATCHES) {
    const distance = levenshteinDistance(normalized, candidate);
    if (distance > 2) {
      continue;
    }

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { distance, code };
    }
  }

  return bestMatch?.code ?? null;
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
    mongoId: readMongoId(brand._id),
    name,
    slug: slugifyImportName(name),
    image: trimNullableText(brand.image),
    isActive: true,
    featured: Boolean(brand.featured),
    createdBy: null,
    createdByName: null,
    updatedBy: null,
    updatedByName: null,
    createdAt: readMongoDate(brand.createdAt),
    updatedAt: readMongoDate(brand.updatedAt),
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
    mongoId: readMongoId(category._id),
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
    createdAt: readMongoDate(category.createdAt),
    updatedAt: readMongoDate(category.updatedAt),
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

      const row = mapMongoCategoryToCurrentSchema(
        mongoCategory,
        parentMongoId ? (categoryIdByMongoId.get(parentMongoId) ?? null) : null,
      );

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

export function mapMongoProductToCurrentSchemaDetailed(
  product: MongoProductDocument,
  lookups: ProductImportLookups = {},
) {
  const title = trimNullableText(product.title);

  if (!title) {
    return null;
  }

  const productMongoId = readMongoId(product._id);
  const brandMongoId = readMongoId(product.brand);
  const categoryMongoId = readMongoId(product.category);
  const unitsSold = Math.max(0, Math.trunc(toFiniteNumber(product.units_sold ?? product.unitsSold, 0)));
  const images = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    : [];
  const stock = Math.max(0, Math.trunc(toFiniteNumber(product.stock, 0)));
  const diagnostics: ProductImportDiagnostics = {
    usedPriceFallback: !isSupportedMoneyValue(product.price),
    oldPriceDropped: product.OldPrice != null && !isSupportedMoneyValue(product.OldPrice),
    purchasePriceDropped: product.purchase_price != null && !isSupportedMoneyValue(product.purchase_price),
  };

  return {
    row: {
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
      inStock: stock > 0,
      availabilityStatus: stock > 0 ? 'in_stock' : 'out_of_stock',
      unitsSold,
      inventoryQuantity: 0,
      brandId: brandMongoId ? (lookups.brandIdByMongoId?.get(brandMongoId) ?? null) : null,
      categoryId: categoryMongoId ? (lookups.categoryIdByMongoId?.get(categoryMongoId) ?? null) : null,
      images,
      createdAt: readMongoDate(product.createdAt),
      updatedAt: readMongoDate(product.updatedAt),
    } satisfies ImportedProductRow,
    diagnostics,
  };
}

export function mapMongoProductToCurrentSchema(
  product: MongoProductDocument,
  lookups: ProductImportLookups = {},
): ImportedProductRow | null {
  return mapMongoProductToCurrentSchemaDetailed(product, lookups)?.row ?? null;
}

export function mapMongoOrderToCurrentSchema(
  order: MongoOrderDocument,
  lookups: OrderImportLookups,
): OrderImportResult {
  const errors: OrderImportIssue[] = [];
  const warnings: OrderImportIssue[] = [];
  const phoneNumber1 = trimNullableScalarText(order.phoneNumber1);

  if (!phoneNumber1) {
    errors.push({
      code: 'missing_phone',
      message: 'Legacy order is missing phoneNumber1.',
      value: null,
    });
  }

  const state = resolveWilayaCode(order.state);
  if (trimNullableScalarText(order.state) && state == null) {
    warnings.push({
      code: 'unresolved_state',
      message: 'Legacy order state could not be matched to a wilaya code.',
      value: trimNullableScalarText(order.state),
    });
    return {
      row: null,
      warnings,
      errors,
    };
  }

  const legacyCartProducts = Array.isArray(order.cartProducts)
    ? order.cartProducts
        .map((value) => readMongoId(value) ?? trimNullableScalarText(value))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  const remappedCartProducts: string[] = [];

  for (const legacyProductId of legacyCartProducts) {
    const productId = lookups.productIdByMongoId.get(legacyProductId);

    if (!productId) {
      errors.push({
        code: 'unmatched_cart_product',
        message: 'Legacy order references a product that was not imported.',
        value: legacyProductId,
      });
      continue;
    }

    remappedCartProducts.push(String(productId));
  }

  if (!phoneNumber1 || errors.length > 0) {
    return {
      row: null,
      warnings,
      errors,
    };
  }

  const confirmed = coerceOrderStatus(order.confirmed);
  const createdAt = readMongoDate(order.createdAt);
  const updatedAt = readMongoDate(order.updatedAt, createdAt);
  const ecotrackCurrentStatus = trimNullableScalarText(order.ecotrackCurrentStatus);
  const ecotrackReference = trimNullableScalarText(order.ecotrackReference);
  const ecotrackTrackingNumber = trimNullableScalarText(order.ecotrackTrackingNumber);
  const ecotrackStatus = trimNullableScalarText(order.ecotrackStatus);

  return {
    row: {
      mongoId: readMongoId(order._id),
      firstName: trimNullableScalarText(order.firstName),
      lastName: trimNullableScalarText(order.lastName),
      state,
      city: trimNullableScalarText(order.city),
      homeAddress: trimNullableScalarText(order.homeAddress),
      email: trimNullableText(order.email)?.toLowerCase() ?? null,
      phoneNumber1,
      phoneNumber2: trimNullableScalarText(order.phoneNumber2),
      cartProducts: remappedCartProducts,
      delivery: coerceDeliveryType(order.delivery),
      delPr: toOptionalMoneyString(typeof order.del_pr === 'number' ? order.del_pr : null),
      price: toOptionalMoneyString(typeof order.price === 'number' ? order.price : null),
      note: trimNullableScalarText(order.note),
      confirmed,
      noAnswerCount: coerceNoAnswerCount(confirmed, order.noAnswerCount, order.confirmed),
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: isConfirmedLifecycleStatus(confirmed) ? updatedAt : null,
      archivedAt: createdAt < ARCHIVE_CUTOFF ? lookups.importNow : null,
      ecotrackStatus,
      ecotrackStatusLastUpdate: ecotrackStatus || ecotrackCurrentStatus ? readMongoDate(order.ecotrackLastSync, updatedAt) : null,
      ecotrackStatusData: ecotrackCurrentStatus ? { currentStatus: ecotrackCurrentStatus } : null,
      ecotrackReference,
      ecotrackTrackingNumber,
      createdAt,
      updatedAt,
    },
    warnings,
    errors: [],
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
