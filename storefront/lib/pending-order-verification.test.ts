import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingOrderVerification,
  readPendingOrderVerification,
  writePendingOrderVerification,
} from "./pending-order-verification";

function createSessionStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

describe("pending-order-verification", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      sessionStorage: createSessionStorage(),
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
    window.sessionStorage.setItem("pendingOrderVerification", JSON.stringify({
      orderId: "bad",
      token: "",
    }));

    expect(readPendingOrderVerification()).toBeNull();
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
