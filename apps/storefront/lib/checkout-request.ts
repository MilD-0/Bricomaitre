export const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

// Keep the deadline active while reading the response body as well as headers.
export async function withCheckoutRequestTimeout<T>(request: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
