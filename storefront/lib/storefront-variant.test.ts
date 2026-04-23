import { describe, expect, it, vi } from "vitest";

import {
  getStorefrontVariant,
  isFastCheckoutVariant,
  normalizeStorefrontVariant,
  readStorefrontVariantCookie,
  resolveStorefrontVariant,
} from "./storefront-variant";

describe("storefront variant helpers", () => {
  it("always resolves to the fast checkout winner", () => {
    expect(normalizeStorefrontVariant()).toBe("fast_checkout");
    expect(resolveStorefrontVariant()).toBe("fast_checkout");
    expect(readStorefrontVariantCookie()).toBe("fast_checkout");
  });

  it("reads the active storefront variant from the browser environment", () => {
    vi.stubGlobal("window", {
      location: { search: "?sf_variant=fast_checkout" },
    });
    vi.stubGlobal("document", {
      cookie: "bric_sf_variant=control",
    });

    expect(getStorefrontVariant()).toBe("fast_checkout");
    expect(isFastCheckoutVariant()).toBe(true);
  });
});
