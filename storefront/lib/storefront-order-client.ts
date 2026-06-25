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
  retryAfterSeconds: number | null;
  requestId: string | null;

  constructor(message: string, options?: {
    status?: number | null;
    code?: string;
    retryAfterSeconds?: number | null;
    requestId?: string | null;
  }) {
    super(message);
    this.name = "StorefrontOrderClientError";
    this.status = options?.status ?? null;
    this.code = options?.code ?? "storefront_order_client_error";
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
    this.requestId = options?.requestId ?? null;
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

  if (payload && typeof payload === "object" && "message" in payload) {
    const value = payload.message;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function parseRetryAfterSeconds(response: Response) {
  const rawValue = response.headers.get("retry-after");
  if (!rawValue) {
    return null;
  }

  const seconds = Number(rawValue);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

function formatRetryDelay(seconds: number | null) {
  if (!seconds) {
    return "quelques minutes";
  }

  if (seconds < 60) {
    return "moins d'une minute";
  }

  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

const VALIDATION_FIELD_LABELS: Record<string, string> = {
  cartProducts: "produits",
  city: "commune",
  delivery: "mode de livraison",
  email: "email",
  firstName: "prenom",
  homeAddress: "adresse",
  lastName: "nom",
  phoneNumber1: "numero de telephone",
  phoneNumber2: "deuxieme numero",
  promoCode: "code promo",
  state: "wilaya",
};

function getObjectProperty(value: unknown, property: string) {
  if (!value || typeof value !== "object" || !(property in value)) {
    return null;
  }

  return (value as Record<string, unknown>)[property];
}

function parseValidationFields(payload: unknown) {
  const errorValue = getObjectProperty(payload, "error");
  const detailsValue = getObjectProperty(payload, "details");
  const fieldErrors = getObjectProperty(errorValue, "fieldErrors") ?? getObjectProperty(detailsValue, "fieldErrors");

  if (!fieldErrors || typeof fieldErrors !== "object" || Array.isArray(fieldErrors)) {
    return [];
  }

  return Object.entries(fieldErrors)
    .filter(([, errors]) => Array.isArray(errors) && errors.length > 0)
    .map(([field]) => VALIDATION_FIELD_LABELS[field] ?? field)
    .slice(0, 4);
}

function buildRequestIdSuffix(requestId: string | null) {
  return requestId ? ` Reference: ${requestId}.` : "";
}

function buildConflictMessage(payload: unknown, retryAfterSeconds: number | null = null) {
  const message = parseErrorMessage(payload);
  if (message === "Order request is already being processed.") {
    return `Une tentative precedente est encore en cours de traitement. Attendez environ ${formatRetryDelay(retryAfterSeconds)}, puis utilisez Reprendre l'envoi.`;
  }

  if (message === "Idempotency key already used with a different payload.") {
    return "Une tentative precedente est sauvegardee avec des informations differentes. Effacez la commande sauvegardee, puis renvoyez.";
  }

  return message ?? "Cette commande est deja en cours de traitement. Reessayez dans une minute.";
}

function buildRequestError(response: Response, payload: unknown, fallbackMessage: string) {
  const retryAfterSeconds = parseRetryAfterSeconds(response);
  const requestId = response.headers.get("x-request-id");

  if (response.status === 429) {
    return new StorefrontOrderClientError(
      `Trop de tentatives de commande. Reessayez dans environ ${formatRetryDelay(retryAfterSeconds)}.`,
      {
        status: response.status,
        code: "rate_limited",
        retryAfterSeconds,
        requestId,
      },
    );
  }

  if (response.status === 400) {
    const fields = parseValidationFields(payload);
    const fieldMessage = fields.length > 0 ? ` Verifiez: ${fields.join(", ")}.` : "";
    return new StorefrontOrderClientError(
      `${parseErrorMessage(payload) ?? "Les informations de commande sont invalides."}${fieldMessage}`,
      {
        status: response.status,
        code: "validation_failed",
        requestId,
      },
    );
  }

  if (response.status === 409) {
    return new StorefrontOrderClientError(
      buildConflictMessage(payload, retryAfterSeconds),
      {
        status: response.status,
        code: "request_conflict",
        retryAfterSeconds,
        requestId,
      },
    );
  }

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return new StorefrontOrderClientError(
      `${parseErrorMessage(payload) ?? "Le service de commande est momentanement indisponible. Reessayez dans quelques minutes."}${buildRequestIdSuffix(requestId)}`,
      {
        status: response.status,
        code: "service_unavailable",
        requestId,
      },
    );
  }

  if (response.status >= 500) {
    return new StorefrontOrderClientError(
      `${parseErrorMessage(payload) ?? "Le serveur de commande a rencontre une erreur. Reessayez dans quelques minutes."}${buildRequestIdSuffix(requestId)}`,
      {
        status: response.status,
        code: "server_error",
        requestId,
      },
    );
  }

  return new StorefrontOrderClientError(
    parseErrorMessage(payload) ?? `${fallbackMessage} (${response.status})`,
    {
      status: response.status,
      code: "request_failed",
      requestId,
    },
  );
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

  return parsed.data.meta
    ? { ...parsed.data.item, meta: parsed.data.meta }
    : parsed.data.item;
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
    throw buildRequestError(response, responseData, "Order request failed");
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
    throw buildRequestError(response, responseData, "Order request failed");
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
    throw buildRequestError(response, responseData, "Order verification failed");
  }

  const parsed = storefrontReadOrderResponseSchema.safeParse(responseData);
  if (!parsed.success) {
    throw new StorefrontOrderClientError("The order verification endpoint returned an invalid response.", {
      code: "invalid_read_response",
    });
  }

  return parsed.data.item;
}
