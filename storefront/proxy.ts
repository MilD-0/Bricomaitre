import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeStorefrontProject,
  STOREFRONT_PROJECT_COOKIE_NAME,
} from "@bric/storefront-core/project-routing";

const FBC_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const STOREFRONT_PROJECT_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const VISIT_ID_COOKIE_NAME = "bric_visit_id";
const VISIT_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PAID_CLICK_COOKIE_NAME = "bric_paid_click";
const PAID_CLICK_SEEN_AT_COOKIE_NAME = "bric_paid_click_seen_at";
const LOCALE_COOKIE_NAME = "lo";
const LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SUPPORTED_LOCALES = new Set(["ar", "fr"]);

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

function applyTrackingCookies(request: NextRequest, response: NextResponse) {
  const fbclid = request.nextUrl.searchParams.get("fbclid")?.trim();

  if (!fbclid) {
    return response;
  }

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

  return response;
}

function applyStorefrontProjectCookie(request: NextRequest, response: NextResponse) {
  const project = normalizeStorefrontProject(request.nextUrl.searchParams.get("sf_variant"));
  if (!project) {
    return response;
  }

  response.cookies.set(STOREFRONT_PROJECT_COOKIE_NAME, project, {
    path: "/",
    sameSite: "lax",
    maxAge: STOREFRONT_PROJECT_MAX_AGE_SECONDS,
  });

  return response;
}

export default function proxy(request: NextRequest) {
  const [, maybeLocale, ...rest] = request.nextUrl.pathname.split("/");

  if (SUPPORTED_LOCALES.has(maybeLocale)) {
    const redirectUrl = request.nextUrl.clone();
    const nextPathname = `/${rest.join("/")}`.replace(/\/+$/, "") || "/";
    redirectUrl.pathname = nextPathname === "//" ? "/" : nextPathname;

    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set(LOCALE_COOKIE_NAME, maybeLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: LOCALE_MAX_AGE_SECONDS,
    });

    return applyStorefrontProjectCookie(
      request,
      applyTrackingCookies(request, applyVisitCookie(request, response)),
    );
  }

  return applyStorefrontProjectCookie(
    request,
    applyTrackingCookies(request, applyVisitCookie(request, NextResponse.next())),
  );
}

export const config = {
  matcher: ["/", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
