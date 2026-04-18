import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ParamBuilder } from "capi-param-builder-nodejs";

export const runtime = "nodejs";

function getAllowedDomains() {
  const configuredUrls = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ].filter((value): value is string => Boolean(value?.trim()));

  const configuredHosts = configuredUrls
    .map((value) => {
      try {
        return new URL(value).hostname;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(["localhost", ...configuredHosts, "bricomaitre.com"]));
}

const schema = z.object({
  event_name: z.string().min(1),
  event_time: z.number().int().positive(),
  event_id: z.string().min(1),
  user_data: z.record(z.string(), z.unknown()).optional().default({}),
  custom_data: z.record(z.string(), z.unknown()).optional().default({}),
  url: z.string().url().optional(),
  test_event_code: z.string().optional(),
  fbclid: z.string().optional(),
});

type CapiBody = z.infer<typeof schema>;

function getFacebookCredentials() {
  return {
    pixelId: process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim() || "",
    token:
      process.env.FACEBOOK_ACCESS_TOKEN?.trim() ||
      process.env.META_CONVERSIONS_API_TOKEN?.trim() ||
      process.env.FB_TOKEN?.trim() ||
      process.env.TOKEN?.trim() ||
      "",
  };
}

function getClientIpAddress(request: NextRequest) {
  const headerCandidates = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "x-vercel-forwarded-for",
    "fly-client-ip",
    "fastly-client-ip",
    "true-client-ip",
  ];

  for (const headerName of headerCandidates) {
    const value = request.headers.get(headerName);
    if (!value) {
      continue;
    }

    const first = value
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);

    if (first) {
      return first;
    }
  }

  return undefined;
}

function getClientUserAgent(request: NextRequest) {
  return request.headers.get("user-agent") || undefined;
}

function parseCookies(cookieHeader: string | null): Record<string, string> | null {
  if (!cookieHeader) return null;
  const cookies: Record<string, string> = {};
  for (const item of cookieHeader.split("; ")) {
    const [name, ...rest] = item.split("=");
    if (name) cookies[name] = rest.join("=");
  }
  return cookies;
}

function parseQueryParams(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

function getStoredFbclid(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader);
  return cookies?._bric_fbclid;
}

async function sendToFacebook({
  eventName,
  eventTime,
  eventId,
  userData,
  customData,
  url,
  testEventCode,
}: {
  eventName: string;
  eventTime: number;
  eventId: string;
  userData: Record<string, string | undefined>;
  customData: Record<string, unknown>;
  url?: string;
  testEventCode?: string;
}): Promise<
  | { ok: true; data: unknown; status: number }
  | { ok: false; error: string; status: number; response?: unknown }
> {
  const { pixelId, token } = getFacebookCredentials();

  if (!pixelId || !token) {
    return { ok: false, error: "Missing Facebook credentials.", status: 503 };
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: "website",
        event_source_url: url,
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  if (testEventCode) payload.test_event_code = testEventCode;

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);
      const fbData = (await response.json()) as unknown;

      if (!response.ok) {
        return {
          ok: false,
          error: `Facebook API ${response.status}`,
          status: response.status,
          response: fbData,
        };
      }

      return { ok: true, data: fbData, status: response.status };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  return {
    ok: false,
    error: lastErr?.message || "Unknown error",
    status: 503,
  };
}

function buildEffectivePayload({
  eventName,
  eventTime,
  eventId,
  userData,
  customData,
  url,
  testEventCode,
}: {
  eventName: string;
  eventTime: number;
  eventId: string;
  userData: Record<string, string | undefined>;
  customData: Record<string, unknown>;
  url?: string;
  testEventCode?: string;
}) {
  return {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: "website",
        event_source_url: url,
        user_data: userData,
        custom_data: customData,
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid data", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const data: CapiBody = parsed.data;
    const incomingUserData = data.user_data as Record<string, string | undefined>;

    // Initialize ParamBuilder
    const builder = new ParamBuilder(getAllowedDomains());

    // Extract request info
    const host = request.headers.get("host") || "localhost";
    const referer = request.headers.get("referer") || undefined;
    const xForwardedFor = request.headers.get("x-forwarded-for") || null;
    const cookieHeader = request.headers.get("cookie");
    const userAgent = getClientUserAgent(request);

    // Get remote address from headers first, then Next.js if available
    const remoteAddress = getClientIpAddress(request) || null;

    // Parse cookies and query params from the event URL
    const cookies = parseCookies(cookieHeader);
    const queryParams = data.url ? parseQueryParams(data.url) : {};
    const fallbackFbclid = data.fbclid?.trim() || getStoredFbclid(cookieHeader);
    if (!queryParams.fbclid && fallbackFbclid) {
      queryParams.fbclid = fallbackFbclid;
    }

    // Process request with Meta's SDK
    builder.processRequest(
      host,
      queryParams,
      cookies,
      referer,
      xForwardedFor,
      remoteAddress
    );

    // Get values from SDK
    const fbc = builder.getFbc();
    const fbp = builder.getFbp();
    const clientIpAddress = getClientIpAddress(request);

    // Build hashed user data using SDK's normalization
    const hashedUserData: Record<string, string | undefined> = {};

// Use SDK for PII hashing - convert null to undefined with ?? undefined
if (incomingUserData.em) {
  hashedUserData.em =
    builder.getNormalizedAndHashedPII(String(incomingUserData.em), "email") ??
    undefined;
}
if (incomingUserData.fn) {
  hashedUserData.fn =
    builder.getNormalizedAndHashedPII(String(incomingUserData.fn), "first_name") ??
    undefined;
}
if (incomingUserData.ln) {
  hashedUserData.ln =
    builder.getNormalizedAndHashedPII(String(incomingUserData.ln), "last_name") ??
    undefined;
}
if (incomingUserData.ph) {
  hashedUserData.ph =
    builder.getNormalizedAndHashedPII(String(incomingUserData.ph), "phone") ??
    undefined;
}
if (incomingUserData.ct) {
  hashedUserData.ct =
    builder.getNormalizedAndHashedPII(String(incomingUserData.ct), "city") ??
    undefined;
}
if (incomingUserData.st) {
  hashedUserData.st =
    builder.getNormalizedAndHashedPII(String(incomingUserData.st), "state") ??
    undefined;
}
if (incomingUserData.zp) {
  hashedUserData.zp =
    builder.getNormalizedAndHashedPII(String(incomingUserData.zp), "zip_code") ??
    undefined;
}
if (incomingUserData.country) {
  hashedUserData.country =
    builder.getNormalizedAndHashedPII(String(incomingUserData.country), "country") ??
    undefined;
}
if (incomingUserData.external_id) {
  hashedUserData.external_id =
    builder.getNormalizedAndHashedPII(
      String(incomingUserData.external_id),
      "external_id"
    ) ?? undefined;
}

    // Use SDK-derived values (overrides client-sent values)
    if (fbc) hashedUserData.fbc = fbc;
    if (fbp) hashedUserData.fbp = fbp;
    if (clientIpAddress) hashedUserData.client_ip_address = clientIpAddress;
    if (userAgent) hashedUserData.client_user_agent = userAgent;

    const effectivePayload = buildEffectivePayload({
      eventName: data.event_name,
      eventTime: data.event_time,
      eventId: data.event_id,
      userData: hashedUserData,
      customData: data.custom_data,
      url: data.url,
      testEventCode: data.test_event_code,
    });

    // Send to Facebook
    const fbResult = await sendToFacebook({
      eventName: data.event_name,
      eventTime: data.event_time,
      eventId: data.event_id,
      userData: hashedUserData,
      customData: data.custom_data,
      url: data.url,
      testEventCode: data.test_event_code,
    });

    if (!fbResult.ok) {
      console.error("CAPI Error:", fbResult.error, fbResult.response);
      return NextResponse.json(
        {
          success: false,
          error: fbResult.error,
          metaStatus: fbResult.status,
          metaResponse: fbResult.response ?? null,
          effectivePayload,
        },
        { status: 503 }
      );
    }

    // Build response with cookies to set
    const response = NextResponse.json({ success: true, data: fbResult.data, effectivePayload });

    // Set cookies from SDK
    for (const cookie of builder.getCookiesToSet()) {
      response.cookies.set(cookie.name, cookie.value, {
        maxAge: cookie.maxAge,
        domain: cookie.domain,
        path: "/",
        sameSite: "lax",
      });
    }

    return response;
  } catch (err) {
    console.error("CAPI route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
