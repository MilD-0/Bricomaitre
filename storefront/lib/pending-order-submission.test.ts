import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingOrderSubmission,
  readPendingOrderSubmission,
  writePendingOrderSubmission,
} from "./pending-order-submission";

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

describe("pending-order-submission", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorage(),
    });
  });

  it("round-trips a valid pending submission", () => {
    writePendingOrderSubmission({
      submissionKey: "submission-key",
      duplicateSignature: {
        phoneNumber1: "0550111111",
        city: null,
        delivery: "home",
        total: 1400,
        signature: "sig-1",
      },
      payload: {
        firstName: null,
        lastName: null,
        email: null,
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: ["1"],
        delivery: 0,
        state: null,
        city: null,
        homeAddress: null,
        note: null,
        visitId: "visit-1",
        journeyId: "journey-1",
        sessionId: "session-1",
        time: 123,
        ev_id: "event-1",
        url: "/checkout",
        fbp: null,
        fbc: null,
      },
      createdAt: new Date().toISOString(),
    });

    expect(readPendingOrderSubmission()).toMatchObject({
      submissionKey: "submission-key",
      duplicateSignature: {
        phoneNumber1: "0550111111",
        delivery: "home",
        signature: "sig-1",
      },
    });
  });

  it("clears invalid pending submission data", () => {
    window.localStorage.setItem("pendingOrderSubmission", JSON.stringify({
      submissionKey: "",
      payload: null,
    }));

    expect(readPendingOrderSubmission()).toBeNull();
  });

  it("removes the pending submission record", () => {
    writePendingOrderSubmission({
      submissionKey: "submission-key",
      duplicateSignature: {
        phoneNumber1: "0550111111",
        city: null,
        delivery: "home",
        total: 1400,
        signature: "sig-1",
      },
      payload: {
        firstName: null,
        lastName: null,
        email: null,
        phoneNumber1: "0550111111",
        phoneNumber2: null,
        cartProducts: ["1"],
        delivery: 0,
        state: null,
        city: null,
        homeAddress: null,
        note: null,
        visitId: null,
        journeyId: null,
        sessionId: null,
        time: 123,
        ev_id: "event-1",
        url: "/checkout",
        fbp: null,
        fbc: null,
      },
      createdAt: new Date().toISOString(),
    });

    clearPendingOrderSubmission();

    expect(readPendingOrderSubmission()).toBeNull();
  });
});
