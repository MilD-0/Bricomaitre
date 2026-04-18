import { NextResponse, type NextRequest } from "next/server";

const FBC_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const VISIT_ID_COOKIE_NAME = "bric_visit_id";
const VISIT_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PAID_CLICK_COOKIE_NAME = "bric_paid_click";
const PAID_CLICK_SEEN_AT_COOKIE_NAME = "bric_paid_click_seen_at";
const VARIANT_COOKIE_NAME = "bric_sf_variant";
const VARIANT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function buildFbcValue(fbclid: string, timestampMs: number) {
  return `fb.1.${timestampMs}.${fbclid}`;
}

function hasCookie(request: NextRequest, name: string) {
  return Boolean(request.cookies.get(name)?.value?.trim());
}

function isMetaPaidRequest(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fbclid = params.get("fbclid")?.trim();
  if (fbclid) {
    return true;
  }

  const utmSource = params.get("utm_source")?.trim().toLowerCase();
  const utmMedium = params.get("utm_medium")?.trim().toLowerCase() ?? "";
  if (!utmSource || !["fb", "facebook", "meta"].includes(utmSource)) {
    return false;
  }

  return ["cpc", "ppc", "paid", "paid_social", "social_paid", "cpv", "cpm"].some((value) => utmMedium.includes(value));
}

function applyVisitCookie(request: NextRequest, response: NextResponse) {
  if (!hasCookie(request, VISIT_ID_COOKIE_NAME)) {
    response.cookies.set(VISIT_ID_COOKIE_NAME, crypto.randomUUID(), {
      path: "/",
      sameSite: "lax",
      maxAge: VISIT_ID_MAX_AGE_SECONDS,
    });
  }

  if (isMetaPaidRequest(request)) {
    response.cookies.set(PAID_CLICK_COOKIE_NAME, "1", {
      path: "/",
      sameSite: "lax",
      maxAge: FBC_MAX_AGE_SECONDS,
    });
    response.cookies.set(PAID_CLICK_SEEN_AT_COOKIE_NAME, String(Date.now()), {
      path: "/",
      sameSite: "lax",
      maxAge: FBC_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export function middleware(request: NextRequest) {
  const response = applyVisitCookie(request, NextResponse.next());
  const requestedVariant = request.nextUrl.searchParams.get("sf_variant");
  const fbclid = request.nextUrl.searchParams.get("fbclid")?.trim();

  if (requestedVariant === "new" || requestedVariant === "legacy" || requestedVariant === "old") {
    response.cookies.set(VARIANT_COOKIE_NAME, requestedVariant === "old" ? "legacy" : requestedVariant, {
      path: "/",
      sameSite: "lax",
      maxAge: VARIANT_MAX_AGE_SECONDS,
    });
  } else if (requestedVariant === "clear") {
    response.cookies.set(VARIANT_COOKIE_NAME, "", {
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    });
  }

  if (fbclid) {
    const timestampMs = Date.now();

    response.cookies.set("_bric_fbclid", fbclid, {
      path: "/",
      sameSite: "lax",
      maxAge: FBC_MAX_AGE_SECONDS,
    });

    response.cookies.set("_fbc", buildFbcValue(fbclid, timestampMs), {
      path: "/",
      sameSite: "lax",
      maxAge: FBC_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
