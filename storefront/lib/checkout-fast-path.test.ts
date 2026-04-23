import { describe, expect, it } from "vitest";

import {
  getAddressHelperKey,
  getCheckoutCartMode,
  getCheckoutItemCount,
  getDefaultOptionalDetailsExpanded,
  isCheckoutCoreComplete,
} from "./checkout-fast-path";

describe("checkout fast-path helpers", () => {
  it("requires phone, wilaya, and commune for the fast-path submit state", () => {
    expect(
      isCheckoutCoreComplete({
        phoneNumber1: "0550 12 34 56",
        selectedWilayaId: 16,
        city: "Alger Centre",
      }),
    ).toBe(true);

    expect(
      isCheckoutCoreComplete({
        phoneNumber1: "0550 12 34 56",
        selectedWilayaId: null,
        city: "Alger Centre",
      }),
    ).toBe(false);
  });

  it("keeps optional details collapsed by default for the default checkout flow", () => {
    expect(getDefaultOptionalDetailsExpanded()).toBe(false);
  });

  it("returns the right address helper copy key for each delivery mode", () => {
    expect(getAddressHelperKey("home")).toBe("homeAddressHelp");
    expect(getAddressHelperKey("office")).toBe("officeAddressHelp");
  });

  it("reports cart mode and item count for single-product and cart flows", () => {
    expect(getCheckoutCartMode(true)).toBe("cart");
    expect(getCheckoutCartMode(false)).toBe("single");
    expect(
      getCheckoutItemCount({
        cart: true,
        cartProducts: ["a", "a", "b"],
        quantity: 1,
      }),
    ).toBe(3);
    expect(
      getCheckoutItemCount({
        cart: false,
        cartProducts: [],
        quantity: 2,
      }),
    ).toBe(2);
  });
});
