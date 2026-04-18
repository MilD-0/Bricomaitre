import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRecentOrderSignature,
  clearCompletedOrderSnapshot,
  hasTrackedPurchase,
  hasRecentOrderSignature,
  markPurchaseTracked,
  readCompletedOrderSnapshot,
  writeRecentOrderSignature,
  writeCompletedOrderSnapshot,
} from "./completed-order-state";

describe("completed-order-state", () => {
  beforeEach(() => {
    const storage = new Map();

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    });
  });

  it("round-trips a completed order snapshot", () => {
    writeCompletedOrderSnapshot({
      orderId: 11,
      token: "public-token",
      modified: false,
      createdAt: new Date().toISOString(),
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phoneNumber1: "0550111111",
      phoneNumber2: null,
      delivery: 0,
      deliveryFee: 400,
      productSubtotal: 1200,
      totalAmount: 1600,
      state: "Alger",
      city: "Algiers",
      homeAddress: "Street 1",
      orderProducts: [{
        rawValue: "mongo-1",
        productId: 1,
        title: "Hammer",
        unitPrice: 1200,
        quantity: 1,
        lineTotal: 1200,
        thumbnailUrl: "https://example.com/hammer.jpg",
        missing: false,
      }],
    });

    expect(readCompletedOrderSnapshot()).toMatchObject({
      orderId: 11,
      token: "public-token",
      state: "Alger",
    });
  });

  it("clears malformed snapshots", () => {
    window.localStorage.setItem("completedOrderSnapshot", JSON.stringify({ orderId: "bad" }));

    expect(readCompletedOrderSnapshot()).toBeNull();
    expect(window.localStorage.getItem("completedOrderSnapshot")).toBeNull();
  });

  it("tracks purchases by order id for dedupe", () => {
    expect(hasTrackedPurchase(11)).toBe(false);

    markPurchaseTracked(11);

    expect(hasTrackedPurchase(11)).toBe(true);
    expect(hasTrackedPurchase(12)).toBe(false);
  });

  it("clears snapshots explicitly", () => {
    writeCompletedOrderSnapshot({
      orderId: 11,
      token: "public-token",
      modified: false,
      createdAt: new Date().toISOString(),
      firstName: null,
      lastName: null,
      fullName: "0550111111",
      email: null,
      phoneNumber1: "0550111111",
      phoneNumber2: null,
      delivery: 0,
      deliveryFee: 0,
      productSubtotal: 0,
      totalAmount: 0,
      state: null,
      city: null,
      homeAddress: null,
      orderProducts: [],
    });

    clearCompletedOrderSnapshot();

    expect(readCompletedOrderSnapshot()).toBeNull();
  });

  it("tracks recent order signatures for duplicate suppression", () => {
    expect(hasRecentOrderSignature("sig-1")).toBe(false);

    writeRecentOrderSignature("sig-1");

    expect(hasRecentOrderSignature("sig-1")).toBe(true);

    clearRecentOrderSignature();

    expect(hasRecentOrderSignature("sig-1")).toBe(false);
  });
});
