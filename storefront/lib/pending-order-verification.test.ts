import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingOrderVerification,
  readPendingOrderVerification,
  writePendingOrderVerification,
} from "./pending-order-verification";

function createLocalStorage() {
  const store = new Map();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

describe("pending-order-verification", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("window", {
      localStorage: createLocalStorage(),
    });
  });

  it("round-trips a valid pending verification record", () => {
    writePendingOrderVerification({
      orderId: 11,
      token: "public-token",
      mode: "create",
      createdAt: new Date().toISOString(),
    });

    expect(readPendingOrderVerification()).toMatchObject({
      orderId: 11,
      token: "public-token",
      mode: "create",
    });
  });

  it("clears invalid pending verification data", () => {
    window.localStorage.setItem("pendingOrderVerification", JSON.stringify({
      orderId: "bad",
      token: "",
    }));

    expect(readPendingOrderVerification()).toBeNull();
  });

  it("clears stale pending verification data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:31:00Z"));
    window.localStorage.setItem("pendingOrderVerification", JSON.stringify({
      orderId: 11,
      token: "public-token",
      mode: "create",
      createdAt: "2026-06-02T12:00:00Z",
    }));

    expect(readPendingOrderVerification()).toBeNull();
    expect(window.localStorage.getItem("pendingOrderVerification")).toBeNull();
    vi.useRealTimers();
  });

  it("removes the pending verification record", () => {
    writePendingOrderVerification({
      orderId: 11,
      token: "public-token",
      mode: "patch",
      createdAt: new Date().toISOString(),
    });

    clearPendingOrderVerification();

    expect(readPendingOrderVerification()).toBeNull();
  });
});
