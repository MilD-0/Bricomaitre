import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import {
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  isConfirmedLifecycleStatus,
} from '../../lib/orders';
import {
  type ImportedProductRow,
  type MongoOrderDocument,
  type MongoProductDocument,
  type OrderImportIssue,
  type OrderImportLookups,
  type OrderImportResult,
  type ProductImportDiagnostics,
  type ProductImportLookups,
} from './mongo-import-contract';
import { resolveWilayaCode } from './mongo-import-geography';
import { slugifyImportName } from './mongo-import-taxonomy';
import {
  isSupportedMoneyValue,
  readMongoDate,
  readMongoId,
  toFiniteNumber,
  toMoneyString,
  toOptionalMoneyString,
  trimNullableScalarText,
  trimNullableText,
} from './mongo-import-values';

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
  const unitsSold = Math.max(
    0,
    Math.trunc(toFiniteNumber(product.units_sold ?? product.unitsSold, 0)),
  );
  const images = Array.isArray(product.images)
    ? product.images.filter(
        (image): image is string => typeof image === 'string' && image.trim().length > 0,
      )
    : [];
  const stock = Math.max(0, Math.trunc(toFiniteNumber(product.stock, 0)));
  const diagnostics: ProductImportDiagnostics = {
    usedPriceFallback: !isSupportedMoneyValue(product.price),
    oldPriceDropped: product.OldPrice != null && !isSupportedMoneyValue(product.OldPrice),
    purchasePriceDropped:
      product.purchase_price != null && !isSupportedMoneyValue(product.purchase_price),
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
      categoryId: categoryMongoId
        ? (lookups.categoryIdByMongoId?.get(categoryMongoId) ?? null)
        : null,
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
      normalizedPhone: normalizeAlgeriaPhone(phoneNumber1),
      phoneNumber2: trimNullableScalarText(order.phoneNumber2),
      cartProducts: remappedCartProducts,
      delivery: coerceDeliveryType(order.delivery),
      deliveryFee: toOptionalMoneyString(typeof order.del_pr === 'number' ? order.del_pr : null),
      price: toOptionalMoneyString(typeof order.price === 'number' ? order.price : null),
      note: trimNullableScalarText(order.note),
      inHouseStatus: confirmed,
      noAnswerCount: coerceNoAnswerCount(confirmed, order.noAnswerCount, order.confirmed),
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: isConfirmedLifecycleStatus(confirmed) ? updatedAt : null,
      ecotrackStatus,
      ecotrackStatusLastUpdate:
        ecotrackStatus || ecotrackCurrentStatus
          ? readMongoDate(order.ecotrackLastSync, updatedAt)
          : null,
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
