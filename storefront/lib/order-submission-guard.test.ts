import { describe, expect, it } from "vitest";

import type { PendingOrderSubmission } from "./pending-order-submission";
import {
  getPendingSubmissionConflict,
  orderPayloadMatchesPending,
} from "./order-submission-guard";

const basePayload = {
  firstName: null,
  lastName: null,
  email: null,
  phoneNumber1: "0550111111",
  phoneNumber2: null,
  cartProducts: ["product-1"],
  delivery: 0 as const,
  state: 16,
  city: "Alger Centre",
  homeAddress: null,
  note: null,
  promoCode: null,
  visitId: "visit-1",
  journeyId: "journey-1",
  sessionId: "session-1",
};

function makePendingSubmission(): PendingOrderSubmission {
  return {
    submissionKey: "submission-key",
    duplicateSignature: {
      phoneNumber1: "0550111111",
      city: "Alger Centre",
      delivery: "home",
      total: 1400,
      signature: "sig-1",
    },
    payload: {
      ...basePayload,
      time: 123,
      ev_id: "event-1",
      url: "/checkout",
      fbp: null,
      fbc: null,
    },
    createdAt: new Date().toISOString(),
  };
}

describe("order-submission-guard", () => {
  it("detects when the current order payload still matches the pending submission", () => {
    const pendingSubmission = makePendingSubmission();

    expect(orderPayloadMatchesPending(pendingSubmission.payload, basePayload)).toBe(true);
    expect(getPendingSubmissionConflict(pendingSubmission, basePayload)).toMatchObject({
      pendingSubmission,
      payloadMatchesPending: true,
    });
  });

  it("still blocks fresh creates when order fields changed while a submission is pending", () => {
    const pendingSubmission = makePendingSubmission();
    const editedPayload = {
      ...basePayload,
      city: "Bab Ezzouar",
    };

    expect(orderPayloadMatchesPending(pendingSubmission.payload, editedPayload)).toBe(false);
    expect(getPendingSubmissionConflict(pendingSubmission, editedPayload)).toMatchObject({
      pendingSubmission,
      payloadMatchesPending: false,
    });
  });

  it("allows create flow when there is no pending submission", () => {
    expect(getPendingSubmissionConflict(null, basePayload)).toBeNull();
  });
});
