import { z } from 'zod';
import { deliveryTypeSchema, type DeliveryType, type OrderStatus } from './status';

const optionalNullableTrimmedString = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value == null) {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });

const optionalNullableEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      return null;
    }

    return z.email().safeParse(trimmed).success ? trimmed : null;
  });

const nullableWilayaCode = z.union([z.number(), z.string(), z.null()]).transform((value) => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 58 ? value : null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 58 ? parsed : null;
});

export const productPromosSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      code: z.string().trim().min(1).max(120),
    }),
  )
  .max(50)
  .refine((offers) => new Set(offers.map((offer) => offer.productId)).size === offers.length, {
    message: 'Only one promotion may be selected for each product.',
  });

export const storefrontOrderCreateSchema = z.object({
  firstName: optionalNullableTrimmedString(80),
  lastName: optionalNullableTrimmedString(80),
  email: optionalNullableEmail,
  phoneNumber1: z.string().trim().min(1).max(50),
  phoneNumber2: optionalNullableTrimmedString(50),
  cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  delivery: deliveryTypeSchema.default(0),
  state: nullableWilayaCode.optional().default(null),
  city: optionalNullableTrimmedString(120),
  homeAddress: optionalNullableTrimmedString(300),
  note: optionalNullableTrimmedString(500),
  promoCode: optionalNullableTrimmedString(120),
  productPromos: productPromosSchema.optional(),
  visitId: optionalNullableTrimmedString(120),
  journeyId: optionalNullableTrimmedString(120),
  sessionId: optionalNullableTrimmedString(120),
});

export type OrderStatusHistoryRecord = {
  id: number;
  status: OrderStatus;
  noAnswerCount: number;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
};

export type OrderProductSummary = {
  productId: number | null;
  brandId?: number | null;
  slug?: string | null;
  rawValue: string;
  title: string;
  titleAr?: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string | null;
  missing: boolean;
};

export type OrderRecord = {
  id: number;
  publicToken?: string | null;
  ecotrackTrackingNumber?: string | null;
  variant?: string | null;
  isDegradedCapture?: boolean;
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email?: string | null;
  phoneNumber1: string;
  phoneNumber2: string | null;
  cartProducts: string[];
  orderProducts: OrderProductSummary[];
  delivery: DeliveryType;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
  subtotalOverride: number | null;
  productSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  promoCode?: string | null;
  productPromos?: Array<{ productId: number; code: string }>;
  promoProductId?: number | null;
  promoOriginalSubtotal?: number | null;
  promoDiscountAmount?: number;
  promoFinalSubtotal?: number | null;
  note: string | null;
  inHouseStatus: OrderStatus;
  noAnswerCount: number;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  hasStatusHistory: boolean;
  statusHistory: OrderStatusHistoryRecord[];
};
