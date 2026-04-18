import {
  storefrontCreateOrderResponseSchema,
  storefrontPatchOrderResponseSchema,
  storefrontReadOrderResponseSchema,
} from "../../packages/storefront-core/src/storefront/contracts";

type RequestMode = "create" | "patch";

export type PendingOrderVerification = {
  orderId: number;
  token: string;
  mode: RequestMode;
  createdAt: string;
};

export class StorefrontOrderClientError extends Error {
  status: number | null;
  code: string;

  constructor(message: string, options?: { status?: number | null; code?: string }) {
    super(message);
    this.name = "StorefrontOrderClientError";
    this.status = options?.status ?? null;
    this.code = options?.code ?? "storefront_order_client_error";
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new StorefrontOrderClientError("Invalid JSON response from order endpoint.", {
      status: response.status,
      code: "invalid_json",
    });
  }
}

function parseErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = payload.error;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function parseCreateSuccess(payload: unknown) {
  const parsed = storefrontCreateOrderResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new StorefrontOrderClientError("The order endpoint returned an invalid success response.", {
      code: "invalid_create_response",
    });
  }

  if (!parsed.data.item.publicToken) {
    throw new StorefrontOrderClientError("The order endpoint did not return an order token.", {
      code: "missing_order_token",
    });
  }

  return parsed.data.item;
}

function parsePatchSuccess(payload: unknown) {
  const parsed = storefrontPatchOrderResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new StorefrontOrderClientError("The order endpoint returned an invalid success response.", {
      code: "invalid_patch_response",
    });
  }

  return parsed.data.item;
}

export async function createStorefrontOrder(input: {
  payload: unknown;
  submissionKey: string;
}) {
  let response: Response;

  try {
    response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": input.submissionKey,
      },
      body: JSON.stringify(input.payload),
    });
  } catch {
    throw new StorefrontOrderClientError("Could not reach the order endpoint.", {
      code: "request_network_error",
    });
  }

  const responseData = await readJson(response);

  if (!response.ok) {
    throw new StorefrontOrderClientError(
      parseErrorMessage(responseData) ?? "Order request failed",
      {
        status: response.status,
        code: "request_failed",
      },
    );
  }

  return parseCreateSuccess(responseData);
}

export async function patchStorefrontOrder(input: {
  orderId: number | string;
  token: string;
  payload: unknown;
}) {
  let response: Response;

  try {
    response = await fetch(`/api/storefront/orders/${input.orderId}?token=${encodeURIComponent(input.token)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.payload),
    });
  } catch {
    throw new StorefrontOrderClientError("Could not reach the order endpoint.", {
      code: "request_network_error",
    });
  }

  const responseData = await readJson(response);

  if (!response.ok) {
    throw new StorefrontOrderClientError(
      parseErrorMessage(responseData) ?? "Order request failed",
      {
        status: response.status,
        code: "request_failed",
      },
    );
  }

  return parsePatchSuccess(responseData);
}

export async function readVerifiedStorefrontOrder(input: {
  orderId: number | string;
  token: string;
}) {
  let response: Response;

  try {
    response = await fetch(`/api/storefront/orders/${input.orderId}?token=${encodeURIComponent(input.token)}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });
  } catch {
    throw new StorefrontOrderClientError("Could not verify the order confirmation.", {
      code: "verification_network_error",
    });
  }

  const responseData = await readJson(response);

  if (!response.ok) {
    throw new StorefrontOrderClientError(
      parseErrorMessage(responseData) ?? "Order verification failed",
      {
        status: response.status,
        code: "verification_failed",
      },
    );
  }

  const parsed = storefrontReadOrderResponseSchema.safeParse(responseData);
  if (!parsed.success) {
    throw new StorefrontOrderClientError("The order verification endpoint returned an invalid response.", {
      code: "invalid_read_response",
    });
  }

  return parsed.data.item;
}
