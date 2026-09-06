export class AdminApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.payload = payload;
  }
}

function parseResponseBody(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
    if (error !== undefined) {
      return JSON.stringify(error);
    }
  }

  return fallback;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let requestInit = init;
  if (init?.body != null) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
      requestInit = { ...init, headers };
    }
  }

  const response = await fetch(url, requestInit);
  const payload = parseResponseBody(await response.text());

  if (!response.ok) {
    throw new AdminApiError(
      readErrorMessage(
        payload,
        response.statusText || `Request failed with status ${response.status}`,
      ),
      response.status,
      payload,
    );
  }

  return payload as T;
}
