import type {
  PendingOrderSubmission,
  PendingOrderSubmissionPayload,
} from "./pending-order-submission";

type OrderSubmissionPayloadFields = Pick<
  PendingOrderSubmissionPayload,
  | "firstName"
  | "lastName"
  | "email"
  | "phoneNumber1"
  | "phoneNumber2"
  | "cartProducts"
  | "delivery"
  | "state"
  | "city"
  | "homeAddress"
  | "note"
  | "promoCode"
  | "visitId"
  | "journeyId"
  | "sessionId"
>;

function arraysMatch(left: string[], right: string[]) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function orderPayloadMatchesPending(
  pendingPayload: OrderSubmissionPayloadFields,
  currentPayload: OrderSubmissionPayloadFields,
) {
  return pendingPayload.firstName === currentPayload.firstName
    && pendingPayload.lastName === currentPayload.lastName
    && pendingPayload.email === currentPayload.email
    && pendingPayload.phoneNumber1 === currentPayload.phoneNumber1
    && pendingPayload.phoneNumber2 === currentPayload.phoneNumber2
    && arraysMatch(pendingPayload.cartProducts, currentPayload.cartProducts)
    && pendingPayload.delivery === currentPayload.delivery
    && pendingPayload.state === currentPayload.state
    && pendingPayload.city === currentPayload.city
    && pendingPayload.homeAddress === currentPayload.homeAddress
    && pendingPayload.note === currentPayload.note
    && pendingPayload.promoCode === currentPayload.promoCode
    && pendingPayload.visitId === currentPayload.visitId
    && pendingPayload.journeyId === currentPayload.journeyId
    && pendingPayload.sessionId === currentPayload.sessionId;
}

export function getPendingSubmissionConflict(
  pendingSubmission: PendingOrderSubmission | null,
  currentPayload: OrderSubmissionPayloadFields,
) {
  if (!pendingSubmission) {
    return null;
  }

  return {
    pendingSubmission,
    payloadMatchesPending: orderPayloadMatchesPending(
      pendingSubmission.payload,
      currentPayload,
    ),
  };
}
