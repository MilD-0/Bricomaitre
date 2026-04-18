type PendingOrderDuplicateSignature = {
  phoneNumber1: string;
  city: string | null;
  delivery: "home" | "office";
  total: number;
  signature: string;
};

type PendingOrderSubmissionPayload = {
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
  visitId: string | null;
  journeyId: string | null;
  sessionId: string | null;
  time: number;
  ev_id: string;
  url: string;
  fbp: string | null;
  fbc: string | null;
};

export type PendingOrderSubmission = {
  submissionKey: string;
  payload: PendingOrderSubmissionPayload;
  duplicateSignature: PendingOrderDuplicateSignature;
  createdAt: string;
};

export const PENDING_ORDER_SUBMISSION_KEY = "pendingOrderSubmission";

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
    && isNullableString(candidate.visitId)
    && isNullableString(candidate.journeyId)
    && isNullableString(candidate.sessionId)
    && Number.isInteger(candidate.time)
    && typeof candidate.ev_id === "string"
    && typeof candidate.url === "string"
    && isNullableString(candidate.fbp)
    && isNullableString(candidate.fbc)
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
    if (
      typeof parsed?.submissionKey !== "string"
      || parsed.submissionKey.trim().length === 0
      || typeof parsed.createdAt !== "string"
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
