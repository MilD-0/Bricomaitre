import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import proxy from "./proxy";

const storefrontRoot = resolve(import.meta.dirname);

describe("storefront Meta tracking cutover", () => {
  it("fires Purchase only from the order-success path without replay implementation", () => {
    const initSource = readFileSync(resolve(storefrontRoot, "app/components/Init.js"), "utf8");
    const orderFormSource = readFileSync(resolve(storefrontRoot, "app/components/OrderForm.jsx"), "utf8");

    expect(initSource).not.toContain("pastEvents");
    expect(initSource).toContain("export async function handlePurchase(meta, options = {})");
    expect(initSource).toContain('window.fbq("track", "Purchase"');
    expect(orderFormSource).not.toContain("purchase_tracking_failed");
    expect(orderFormSource).toContain('semanticsVersion: "confirmed_purchase_v1"');
    expect(orderFormSource).toContain("handlePurchase(successfulOrder.meta, {");
    expect(initSource).not.toContain('eventName: "order_create_success"');
    expect(initSource.match(/eventName: "purchase"/g)).toHaveLength(1);
    expect(orderFormSource).toContain("buildQuantityAwareAnalyticsItems");
  });

  it("uses quantity-aware cart events and promo-adjusted Pixel prices", () => {
    const cartSource = readFileSync(resolve(storefrontRoot, "app/cart/Main.jsx"), "utf8");
    const productSource = readFileSync(resolve(storefrontRoot, "app/products/[id]/Main.jsx"), "utf8");

    expect(cartSource).toContain("buildCartTrackingProducts(cartSummary.items)");
    expect(cartSource).toContain("lastTrackedCartViewKeyRef");
    expect(productSource).toContain("withTrackingPrice(currentProduct, effectivePrice)");
    expect(productSource).toContain("trackingPrice: effectivePrice");
  });

  it("tracks debounced and submitted storefront searches through Meta Search", () => {
    const initSource = readFileSync(resolve(storefrontRoot, "app/components/Init.js"), "utf8");
    const headerSearchSource = readFileSync(resolve(storefrontRoot, "app/components/search.tsx"), "utf8");
    const mobileSearchSource = readFileSync(resolve(storefrontRoot, "app/components/SearchBar.js"), "utf8");

    expect(initSource).toContain("export async function handleSearch(searchTerm)");
    expect(initSource).toContain('name: "Search"');
    expect(initSource).toContain("pixelData: { search_string: normalizedTerm }");
    expect(initSource).toContain("searchTerm: normalizedTerm");
    expect(initSource).toContain("eventId: result.eventId");
    expect(headerSearchSource).toContain("lastTrackedQuery.current !== query");
    expect(headerSearchSource).toContain("void handleSearch(query)");
    expect(headerSearchSource).toContain("void handleSearch(submittedQuery)");
    expect(mobileSearchSource).toContain("performSearch();");
    expect(mobileSearchSource).toContain("void handleSearch(text)");
  });

  it("does not rewrite _fbc for the same fbclid", () => {
    const response = proxy(new NextRequest(
      "https://bricomaitre.com/products/1?fbclid=click-1",
      {
        headers: {
          cookie: "_bric_fbclid=click-1; _fbc=fb.1.1700000000.click-1",
        },
      },
    ));

    expect(response.cookies.get("_fbc")).toBeUndefined();
  });

  it("writes secure tracking cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(new NextRequest(
      "https://bricomaitre.com/products/1?fbclid=click-2",
    ));
    expect(response.cookies.get("_fbc")?.secure).toBe(true);
    vi.unstubAllEnvs();
  });
});
