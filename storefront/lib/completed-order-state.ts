export type CompletedOrderSnapshotItem = {
  rawValue: string;
  productId: number | null;
  title: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string | null;
  missing: boolean;
};

export type CompletedOrderSnapshot = {
  orderId: number;
  token: string | null;
  modified: boolean;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phoneNumber1: string;
  phoneNumber2: string | null;
  delivery: 0 | 1;
  deliveryFee: number;
  productSubtotal: number;
  totalAmount: number;
  state: string | null;
  city: string | null;
  homeAddress: string | null;
  orderProducts: CompletedOrderSnapshotItem[];
};

const COMPLETED_ORDER_SNAPSHOT_KEY = "completedOrderSnapshot";
const TRACKED_PURCHASES_KEY = "trackedPurchases";
const RECENT_ORDER_SIGNATURE_KEY = "recentOrderSignature";
const RECENT_ORDER_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isSnapshotItem(value: unknown): value is CompletedOrderSnapshotItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.rawValue === "string"
    && (candidate.productId === null || Number.isInteger(candidate.productId))
    && typeof candidate.title === "string"
    && typeof candidate.unitPrice === "number"
    && Number.isFinite(candidate.unitPrice)
    && typeof candidate.quantity === "number"
    && Number.isInteger(candidate.quantity)
    && candidate.quantity > 0
    && typeof candidate.lineTotal === "number"
    && Number.isFinite(candidate.lineTotal)
    && isNullableString(candidate.thumbnailUrl)
    && typeof candidate.missing === "boolean"
  );
}

function isSnapshot(value: unknown): value is CompletedOrderSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.orderId === "number"
    && Number.isInteger(candidate.orderId)
    && candidate.orderId > 0
    && isNullableString(candidate.token)
    && typeof candidate.modified === "boolean"
    && typeof candidate.createdAt === "string"
    && isNullableString(candidate.firstName)
    && isNullableString(candidate.lastName)
    && typeof candidate.fullName === "string"
    && isNullableString(candidate.email)
    && typeof candidate.phoneNumber1 === "string"
    && isNullableString(candidate.phoneNumber2)
    && (candidate.delivery === 0 || candidate.delivery === 1)
    && typeof candidate.deliveryFee === "number"
    && Number.isFinite(candidate.deliveryFee)
    && typeof candidate.productSubtotal === "number"
    && Number.isFinite(candidate.productSubtotal)
    && typeof candidate.totalAmount === "number"
    && Number.isFinite(candidate.totalAmount)
    && isNullableString(candidate.state)
    && isNullableString(candidate.city)
    && isNullableString(candidate.homeAddress)
    && Array.isArray(candidate.orderProducts)
    && candidate.orderProducts.every(isSnapshotItem)
  );
}

function readTrackedPurchasesMap() {
  const storage = getStorage();
  const rawValue = storage?.getItem(TRACKED_PURCHASES_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      storage?.removeItem(TRACKED_PURCHASES_KEY);
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => key.trim().length > 0 && typeof value === "string"),
    );
  } catch {
    storage?.removeItem(TRACKED_PURCHASES_KEY);
    return {};
  }
}

function writeTrackedPurchasesMap(value: Record<string, string>) {
  getStorage()?.setItem(TRACKED_PURCHASES_KEY, JSON.stringify(value));
}

function isRecentSignatureRecord(value: unknown): value is { signature: string; timestamp: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.signature === "string"
    && candidate.signature.trim().length > 0
    && typeof candidate.timestamp === "number"
    && Number.isFinite(candidate.timestamp)
  );
}

function readRecentSignatureRecord() {
  const storage = getStorage();
  const rawValue = storage?.getItem(RECENT_ORDER_SIGNATURE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { signature: string; timestamp: number };
    if (!isRecentSignatureRecord(parsed)) {
      storage?.removeItem(RECENT_ORDER_SIGNATURE_KEY);
      return null;
    }

    if (Date.now() - parsed.timestamp > RECENT_ORDER_SIGNATURE_WINDOW_MS) {
      storage?.removeItem(RECENT_ORDER_SIGNATURE_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(RECENT_ORDER_SIGNATURE_KEY);
    return null;
  }
}

export function readCompletedOrderSnapshot() {
  const storage = getStorage();
  const rawValue = storage?.getItem(COMPLETED_ORDER_SNAPSHOT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as CompletedOrderSnapshot;
    if (!isSnapshot(parsed)) {
      storage?.removeItem(COMPLETED_ORDER_SNAPSHOT_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(COMPLETED_ORDER_SNAPSHOT_KEY);
    return null;
  }
}

export function writeCompletedOrderSnapshot(value: CompletedOrderSnapshot) {
  getStorage()?.setItem(COMPLETED_ORDER_SNAPSHOT_KEY, JSON.stringify(value));
}

export function clearCompletedOrderSnapshot() {
  getStorage()?.removeItem(COMPLETED_ORDER_SNAPSHOT_KEY);
}

export function hasTrackedPurchase(orderId: number) {
  return Boolean(readTrackedPurchasesMap()[String(orderId)]);
}

export function markPurchaseTracked(orderId: number) {
  const tracked = readTrackedPurchasesMap();
  tracked[String(orderId)] = new Date().toISOString();
  writeTrackedPurchasesMap(tracked);
}

export function hasRecentOrderSignature(signature: string) {
  const recent = readRecentSignatureRecord();
  return recent?.signature === signature;
}

export function writeRecentOrderSignature(signature: string) {
  getStorage()?.setItem(RECENT_ORDER_SIGNATURE_KEY, JSON.stringify({
    signature,
    timestamp: Date.now(),
  }));
}

export function clearRecentOrderSignature() {
  getStorage()?.removeItem(RECENT_ORDER_SIGNATURE_KEY);
}
