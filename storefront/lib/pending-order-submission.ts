type PendingOrderDuplicateSignature = {
  phoneNumber1: string;
  city: string | null;
  delivery: "home" | "office";
  total: number;
  signature: string;
};

export type PendingOrderSubmissionPayload = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber1: string;
  phoneNumber2: string | null;
  cartProducts: string[];
  delivery: 0 | 1;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
  note: null;
  promoCode?: string | null;
  visitId: string | null;
  journeyId: string | null;
  sessionId: string | null;
  time?: number;
  ev_id?: string;
  url?: string;
  fbp?: string | null;
  fbc?: string | null;
  meta?: {
    semanticsVersion: "confirmed_purchase_v1";
    leadEventId: string;
    eventSourceUrl: string;
  };
};

export type PendingOrderSubmission = {
  submissionKey: string;
  payload: PendingOrderSubmissionPayload;
  duplicateSignature: PendingOrderDuplicateSignature;
  createdAt: string;
};

export const PENDING_ORDER_SUBMISSION_KEY = "pendingOrderSubmission";
const PENDING_ORDER_SUBMISSION_TTL_MS = 30 * 60 * 1000;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isDeliveryType(value: unknown) {
  return value === 0 || value === 1;
}

function isDuplicateSignature(value: unknown): value is PendingOrderDuplicateSignature {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.phoneNumber1 === "string"
    && isNullableString(candidate.city)
    && (candidate.delivery === "home" || candidate.delivery === "office")
    && typeof candidate.total === "number"
    && Number.isFinite(candidate.total)
    && typeof candidate.signature === "string"
    && candidate.signature.trim().length > 0
  );
}

function isPayload(value: unknown): value is PendingOrderSubmissionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const meta = candidate.meta as Record<string, unknown> | undefined;
  const hasNewMeta = Boolean(
    meta
    && meta.semanticsVersion === "confirmed_purchase_v1"
    && typeof meta.leadEventId === "string"
    && meta.leadEventId.trim().length > 0
    && typeof meta.eventSourceUrl === "string"
    && meta.eventSourceUrl.trim().length > 0,
  );
  const hasLegacyMeta = Number.isInteger(candidate.time)
    && typeof candidate.ev_id === "string"
    && typeof candidate.url === "string"
    && isNullableString(candidate.fbp)
    && isNullableString(candidate.fbc);

  return (
    isNullableString(candidate.firstName)
    && isNullableString(candidate.lastName)
    && isNullableString(candidate.email)
    && typeof candidate.phoneNumber1 === "string"
    && isNullableString(candidate.phoneNumber2)
    && Array.isArray(candidate.cartProducts)
    && candidate.cartProducts.every((item: unknown) => typeof item === "string")
    && isDeliveryType(candidate.delivery)
    && (candidate.state === null || Number.isInteger(candidate.state))
    && isNullableString(candidate.city)
    && isNullableString(candidate.homeAddress)
    && candidate.note === null
    && (candidate.promoCode === undefined || isNullableString(candidate.promoCode))
    && isNullableString(candidate.visitId)
    && isNullableString(candidate.journeyId)
    && isNullableString(candidate.sessionId)
    && (hasNewMeta || hasLegacyMeta)
  );
}

export function readPendingOrderSubmission() {
  const storage = getStorage();
  const rawValue = storage?.getItem(PENDING_ORDER_SUBMISSION_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PendingOrderSubmission;
    const createdAtMs = Date.parse(parsed.createdAt);
    if (
      typeof parsed?.submissionKey !== "string"
      || parsed.submissionKey.trim().length === 0
      || typeof parsed.createdAt !== "string"
      || !Number.isFinite(createdAtMs)
      || Date.now() - createdAtMs > PENDING_ORDER_SUBMISSION_TTL_MS
      || !isPayload(parsed.payload)
      || !isDuplicateSignature(parsed.duplicateSignature)
    ) {
      storage?.removeItem(PENDING_ORDER_SUBMISSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(PENDING_ORDER_SUBMISSION_KEY);
    return null;
  }
}

export function writePendingOrderSubmission(value: PendingOrderSubmission) {
  getStorage()?.setItem(PENDING_ORDER_SUBMISSION_KEY, JSON.stringify(value));
}

export function clearPendingOrderSubmission() {
  getStorage()?.removeItem(PENDING_ORDER_SUBMISSION_KEY);
}
