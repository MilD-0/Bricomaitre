import {
  buildEcotrackResultMessage,
  readEcotrackMessage,
  readEcotrackSuccess,
  readEcotrackTracking,
  requestEcotrack,
} from '../ecotrack-provider';
import { type EcotrackCreateOrderResult, type EcotrackOrderPayload } from './contract';

export async function createEcotrackOrdersBatch(
  ordersBatch: EcotrackOrderPayload[],
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const keyedOrders = Object.fromEntries(ordersBatch.map((order, index) => [String(index), order]));
  const result = await requestEcotrack({
    path: '/create/orders',
    method: 'POST',
    json: { orders: keyedOrders },
    deadlineAt: options.deadlineAt,
    fetchImpl: options.fetchImpl ?? fetch,
    env: options.env ?? process.env,
  });

  const payloadObject =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  const rawResults =
    typeof payloadObject.results === 'object' && payloadObject.results !== null
      ? (payloadObject.results as Record<string, unknown>)
      : {};
  const normalized = new Map<string, EcotrackCreateOrderResult>();

  for (const [index, order] of ordersBatch.entries()) {
    const raw = rawResults[order.reference] ?? rawResults[String(index)];
    normalized.set(order.reference, {
      success: readEcotrackSuccess(raw),
      tracking: readEcotrackTracking(raw),
      message:
        readEcotrackMessage(raw) ??
        (readEcotrackSuccess(raw)
          ? null
          : buildEcotrackResultMessage(raw, 'Ecotrack rejected the order.')),
      raw,
    });
  }

  return {
    rateLimit: result.rateLimit,
    results: normalized,
    raw: result.payload,
  };
}
