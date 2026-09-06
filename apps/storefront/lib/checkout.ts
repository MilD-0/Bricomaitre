import {
  storefrontOrderCreateRequestSchema,
  storefrontOrderResponseItemSchema,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontOrderCreateRequest,
} from '@bric/storefront-core/contracts';
import { z } from 'zod';
import type { StorefrontOrderMarketing } from '@bric/storefront-core/marketing-contracts';
import { META_SEMANTICS_VERSION } from '@bric/storefront-core/meta-contracts';
import { normalizeAlgerianPhoneNumber } from '@bric/storefront-core/settings';

import { cartItemSchema, type CartItem } from '@/lib/cart';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value === '' || z.email().safeParse(value).success, 'invalid_email')
  .transform((value) => value || null);
const algerianPhone = z
  .string()
  .trim()
  .min(1, 'phone_required')
  .max(50, 'phone_invalid')
  .transform(normalizeAlgerianPhoneNumber)
  .refine((value) => /^\d{8,15}$/.test(value), 'phone_invalid');

export const checkoutFormSchema = z.object({
  phoneNumber1: algerianPhone,
  lastName: optionalText(80),
  firstName: optionalText(80),
  state: z.coerce.number().int().min(1, 'location_required').max(58, 'location_required'),
  city: z.string().trim().min(1, 'location_required').max(120),
  homeAddress: optionalText(300),
  email: optionalEmail,
  delivery: z.enum(['home', 'office']),
});

export type ValidatedCheckoutForm = z.output<typeof checkoutFormSchema>;

export function getCheckoutCommunes(
  catalog: StorefrontEcotrackCatalogResponse,
  wilayaId: number | null,
) {
  if (wilayaId == null) return [];
  return catalog.communes.filter((commune) => commune.wilayaId === wilayaId);
}

export function hasCheckoutStopDesk(
  catalog: StorefrontEcotrackCatalogResponse,
  wilayaId: number | null,
) {
  return getCheckoutCommunes(catalog, wilayaId).some((commune) => commune.hasStopDesk);
}

export function getCheckoutDeliveryFee(
  catalog: StorefrontEcotrackCatalogResponse,
  wilayaId: number | null,
  delivery: 'home' | 'office',
) {
  if (wilayaId == null) return 0;
  const fee = catalog.serviceFees.find(
    (entry) => entry.wilayaId === wilayaId && entry.serviceType === 'livraison',
  );
  if (!fee) return 0;
  const value = Number(delivery === 'office' ? fee.stopDeskFee : fee.homeFee);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function expandCheckoutCart(items: CartItem[]) {
  const products = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => item.token || String(item.productId)),
  );
  if (products.length > 50) throw new Error('checkout_quantity_limit');
  return products;
}

export function buildCheckoutOrderPayload(options: {
  form: ValidatedCheckoutForm;
  cartProducts: string[];
  visitId: string | null;
  journeyId: string | null;
  sessionId: string | null;
  marketing?: StorefrontOrderMarketing;
  promoCode?: string | null;
  productPromos?: Array<{ productId: number; code: string }>;
  expectedProductSubtotal?: number;
}): StorefrontOrderCreateRequest {
  return storefrontOrderCreateRequestSchema.parse({
    firstName: options.form.firstName,
    lastName: options.form.lastName,
    email: options.form.email,
    phoneNumber1: options.form.phoneNumber1,
    phoneNumber2: null,
    cartProducts: options.cartProducts,
    delivery: options.form.delivery === 'office' ? 1 : 0,
    state: options.form.state,
    city: options.form.city,
    homeAddress: options.form.homeAddress,
    note: null,
    promoCode: options.promoCode ?? null,
    ...(options.productPromos ? { productPromos: options.productPromos } : {}),
    ...(options.expectedProductSubtotal !== undefined
      ? { expectedProductSubtotal: options.expectedProductSubtotal }
      : {}),
    visitId: options.visitId,
    journeyId: options.journeyId,
    sessionId: options.sessionId,
    ...(options.marketing
      ? {
          marketing: options.marketing,
          meta: {
            semanticsVersion: META_SEMANTICS_VERSION,
            leadEventId: options.marketing.eventId,
            eventSourceUrl: options.marketing.eventSourceUrl,
          },
        }
      : {}),
  });
}

const pendingCheckoutSchema = z.object({
  idempotencyKey: z.string().min(1),
  payload: storefrontOrderCreateRequestSchema,
  createdAt: z.string().datetime({ offset: true }),
  retryAt: z.number().nonnegative().optional(),
  items: z.array(cartItemSchema).max(50).optional(),
  cartMode: z.enum(['cart', 'direct']).optional(),
  deliveryFee: z.number().nonnegative().optional(),
});

const checkoutConfirmationSchema = z.object({
  order: storefrontOrderResponseItemSchema,
  cartMode: z.enum(['cart', 'direct']),
  stateName: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  purchaseEventId: z.string().min(1).max(120).nullable().default(null),
});

const checkoutDraftSchema = z.object({
  phoneNumber1: z.string().max(50),
  lastName: z.string().max(80),
  firstName: z.string().max(80),
  state: z.number().int().min(1).max(58).nullable(),
  city: z.string().max(120),
  homeAddress: z.string().max(300),
  email: z.string().max(254),
  delivery: z.enum(['home', 'office']),
});

export type PendingCheckout = z.infer<typeof pendingCheckoutSchema>;
export type CheckoutConfirmation = z.infer<typeof checkoutConfirmationSchema>;
export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;

const PENDING_CHECKOUT_KEY = 'bric:checkout:pending:v1';
export const CHECKOUT_CONFIRMATION_KEY = 'bric:checkout:confirmation:v1';
const CHECKOUT_DRAFT_KEY = 'bric:checkout:draft:v1';

function readStored<T>(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  schema: z.ZodType<T>,
) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid browser state is discarded below.
  }
  try {
    storage.removeItem(key);
  } catch {
    // Browser persistence is optional; invalid state can remain until storage is available again.
  }
  return null;
}

export function readPendingCheckout(storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  return readStored(storage, PENDING_CHECKOUT_KEY, pendingCheckoutSchema);
}

export function writePendingCheckout(storage: Pick<Storage, 'setItem'>, value: PendingCheckout) {
  try {
    storage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pendingCheckoutSchema.parse(value)));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingCheckout(storage: Pick<Storage, 'removeItem'>) {
  try {
    storage.removeItem(PENDING_CHECKOUT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readCheckoutDraft(storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  return readStored(storage, CHECKOUT_DRAFT_KEY, checkoutDraftSchema);
}

export function writeCheckoutDraft(storage: Pick<Storage, 'setItem'>, value: CheckoutDraft) {
  try {
    storage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(checkoutDraftSchema.parse(value)));
    return true;
  } catch {
    return false;
  }
}

export function readCheckoutConfirmation(storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  return readStored(storage, CHECKOUT_CONFIRMATION_KEY, checkoutConfirmationSchema);
}

export function writeCheckoutConfirmation(
  storage: Pick<Storage, 'setItem'>,
  value: CheckoutConfirmation,
) {
  try {
    storage.setItem(
      CHECKOUT_CONFIRMATION_KEY,
      JSON.stringify(checkoutConfirmationSchema.parse(value)),
    );
    return true;
  } catch {
    return false;
  }
}
