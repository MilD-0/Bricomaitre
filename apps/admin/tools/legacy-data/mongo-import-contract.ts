import type { brands, categories, orders, products } from '@bric/db/schema';
import type { InferInsertModel } from 'drizzle-orm';

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

type ProductInsert = InferInsertModel<typeof products>;

type BrandInsert = InferInsertModel<typeof brands>;

type CategoryInsert = InferInsertModel<typeof categories>;

type OrderInsert = InferInsertModel<typeof orders>;

export type ImportedProductRow = Required<
  Pick<
    ProductInsert,
    | 'mongoId'
    | 'title'
    | 'slug'
    | 'titleAr'
    | 'description'
    | 'descriptionAr'
    | 'sku'
    | 'barcode'
    | 'price'
    | 'oldPrice'
    | 'purchasePrice'
    | 'active'
    | 'inStock'
    | 'availabilityStatus'
    | 'unitsSold'
    | 'inventoryQuantity'
    | 'brandId'
    | 'categoryId'
    | 'images'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export type ImportedBrandRow = Required<
  Pick<
    BrandInsert,
    | 'mongoId'
    | 'name'
    | 'slug'
    | 'image'
    | 'isActive'
    | 'featured'
    | 'createdBy'
    | 'createdByName'
    | 'updatedBy'
    | 'updatedByName'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export type ImportedCategoryRow = Required<
  Pick<
    CategoryInsert,
    | 'mongoId'
    | 'name'
    | 'slug'
    | 'nameEn'
    | 'nameAr'
    | 'image'
    | 'isActive'
    | 'parentId'
    | 'properties'
    | 'featured'
    | 'createdBy'
    | 'createdByName'
    | 'updatedBy'
    | 'updatedByName'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export type ImportedOrderRow = Required<
  Pick<
    OrderInsert,
    | 'mongoId'
    | 'firstName'
    | 'lastName'
    | 'state'
    | 'city'
    | 'homeAddress'
    | 'email'
    | 'phoneNumber1'
    | 'normalizedPhone'
    | 'phoneNumber2'
    | 'cartProducts'
    | 'delivery'
    | 'deliveryFee'
    | 'price'
    | 'note'
    | 'inHouseStatus'
    | 'noAnswerCount'
    | 'confirmedBy'
    | 'confirmedByName'
    | 'confirmedAt'
    | 'ecotrackStatus'
    | 'ecotrackStatusLastUpdate'
    | 'ecotrackStatusData'
    | 'ecotrackReference'
    | 'ecotrackTrackingNumber'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export type ProductImportLookups = {
  brandIdByMongoId?: Map<string, number>;
  categoryIdByMongoId?: Map<string, number>;
};

export type OrderImportLookups = {
  productIdByMongoId: Map<string, number>;
};

export type ProductImportDiagnostics = {
  usedPriceFallback: boolean;
  oldPriceDropped: boolean;
  purchasePriceDropped: boolean;
};

export type OrderImportIssue = {
  code: 'missing_phone' | 'unresolved_state' | 'unmatched_cart_product';
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
