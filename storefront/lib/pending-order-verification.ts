import type { PendingOrderVerification } from "./storefront-order-client";

export const PENDING_ORDER_VERIFICATION_KEY = "pendingOrderVerification";
const PENDING_ORDER_VERIFICATION_TTL_MS = 30 * 60 * 1000;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readPendingOrderVerification() {
  const storage = getStorage();
  const rawValue = storage?.getItem(PENDING_ORDER_VERIFICATION_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PendingOrderVerification;
    if (
      typeof parsed?.orderId !== "number"
      || !Number.isInteger(parsed.orderId)
      || parsed.orderId <= 0
      || typeof parsed.token !== "string"
      || parsed.token.trim().length === 0
      || (parsed.mode !== "create" && parsed.mode !== "patch")
      || typeof parsed.createdAt !== "string"
      || !Number.isFinite(Date.parse(parsed.createdAt))
      || Date.now() - Date.parse(parsed.createdAt) > PENDING_ORDER_VERIFICATION_TTL_MS
    ) {
      storage?.removeItem(PENDING_ORDER_VERIFICATION_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(PENDING_ORDER_VERIFICATION_KEY);
    return null;
  }
}

export function writePendingOrderVerification(value: PendingOrderVerification) {
  getStorage()?.setItem(PENDING_ORDER_VERIFICATION_KEY, JSON.stringify(value));
}

export function clearPendingOrderVerification() {
  getStorage()?.removeItem(PENDING_ORDER_VERIFICATION_KEY);
}
