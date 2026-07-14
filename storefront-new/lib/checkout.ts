import {
  storefrontOrderCreateRequestSchema,
  storefrontOrderResponseItemSchema,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontOrderCreateRequest,
} from '@bric/storefront-core/contracts';
import { z } from 'zod';

import type { CartItem } from '@/lib/cart';

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === '' || z.email().safeParse(value).success,
  'invalid_email',
).transform((value) => value || null);

export const checkoutFormSchema = z.object({
  phoneNumber1: z.string().trim().min(6, 'phone_required').max(50, 'phone_invalid'),
  lastName: optionalText(80),
  firstName: optionalText(80),
  state: z.coerce.number().int().min(1, 'location_required').max(58, 'location_required'),
  city: z.string().trim().min(1, 'location_required').max(120),
  homeAddress: optionalText(300),
  email: optionalEmail,
  delivery: z.enum(['home', 'office']),
});

export type CheckoutFormValues = z.input<typeof checkoutFormSchema>;
export type ValidatedCheckoutForm = z.output<typeof checkoutFormSchema>;

export function getCheckoutCommunes(catalog: StorefrontEcotrackCatalogResponse, wilayaId: number | null) {
  if (wilayaId == null) return [];
  return catalog.communes.filter((commune) => commune.wilayaId === wilayaId);
}

export function hasCheckoutStopDesk(catalog: StorefrontEcotrackCatalogResponse, wilayaId: number | null) {
  return getCheckoutCommunes(catalog, wilayaId).some((commune) => commune.hasStopDesk);
}

export function getCheckoutDeliveryFee(
  catalog: StorefrontEcotrackCatalogResponse,
  wilayaId: number | null,
  delivery: 'home' | 'office',
) {
  if (wilayaId == null) return 0;
  const fee = catalog.serviceFees.find((entry) => entry.wilayaId === wilayaId && entry.serviceType === 'livraison');
  if (!fee) return 0;
  const value = Number(delivery === 'office' ? fee.stopDeskFee : fee.homeFee);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function expandCheckoutCart(items: CartItem[]) {
  return items.flatMap((item) => Array.from(
    { length: Math.min(20, item.quantity) },
    () => item.token || String(item.productId),
  )).slice(0, 50);
}

export function buildCheckoutOrderPayload(options: {
  form: ValidatedCheckoutForm;
  cartProducts: string[];
  journeyId: string | null;
  sessionId: string | null;
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
    promoCode: null,
    visitId: null,
    journeyId: options.journeyId,
    sessionId: options.sessionId,
  });
}

const pendingCheckoutSchema = z.object({
  idempotencyKey: z.string().min(1),
  payload: storefrontOrderCreateRequestSchema,
  createdAt: z.string().datetime({ offset: true }),
});

const checkoutConfirmationSchema = z.object({
  order: storefrontOrderResponseItemSchema,
  cartMode: z.enum(['cart', 'direct']),
  stateName: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export type PendingCheckout = z.infer<typeof pendingCheckoutSchema>;
export type CheckoutConfirmation = z.infer<typeof checkoutConfirmationSchema>;

export const PENDING_CHECKOUT_KEY = 'bric:checkout:pending:v1';
export const CHECKOUT_CONFIRMATION_KEY = 'bric:checkout:confirmation:v1';

function readStored<T>(storage: Pick<Storage, 'getItem' | 'removeItem'>, key: string, schema: z.ZodType<T>) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid browser state is discarded below.
  }
  storage.removeItem(key);
  return null;
}

export function readPendingCheckout(storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  return readStored(storage, PENDING_CHECKOUT_KEY, pendingCheckoutSchema);
}

export function writePendingCheckout(storage: Pick<Storage, 'setItem'>, value: PendingCheckout) {
  storage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pendingCheckoutSchema.parse(value)));
}

export function clearPendingCheckout(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(PENDING_CHECKOUT_KEY);
}

export function readCheckoutConfirmation(storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  return readStored(storage, CHECKOUT_CONFIRMATION_KEY, checkoutConfirmationSchema);
}

export function writeCheckoutConfirmation(storage: Pick<Storage, 'setItem'>, value: CheckoutConfirmation) {
  storage.setItem(CHECKOUT_CONFIRMATION_KEY, JSON.stringify(checkoutConfirmationSchema.parse(value)));
}
