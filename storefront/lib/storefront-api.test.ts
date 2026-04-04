import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchStorefrontBrands,
  findDeliveryFee,
  normalizeFeaturedGroup,
  type LegacyProduct,
} from "./storefront-api";

describe("storefront-api upstream fallback logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PHASE;
  });

  it("fails fast during next production builds when storefront-api is unavailable", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fetchStorefrontBrands()).rejects.toThrow(
      "Storefront API is unavailable: /api/storefront/brands",
    );

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("keeps runtime upstream fallback logs outside the build phase", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fetchStorefrontBrands()).resolves.toEqual([]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[storefront] upstream request failed for /api/storefront/brands",
      "Storefront API is unavailable: /api/storefront/brands",
    );
  });
});

describe("storefront-api delivery fee lookup", () => {
  const catalog = {
    wilayas: [{ wilayaId: 16, name: "Alger" }],
    communes: [],
    serviceFees: [
      { serviceType: "livraison", wilayaId: 16, homeFee: "400", stopDeskFee: "350" },
      { serviceType: "pickup", wilayaId: 16, homeFee: "999", stopDeskFee: "999" },
    ],
    weightFees: [],
    lastSync: null,
  };

  it("returns the home fee for home delivery", () => {
    expect(findDeliveryFee(catalog, 16, "home")).toBe(400);
  });

  it("returns the office fee for office delivery", () => {
    expect(findDeliveryFee(catalog, 16, "office")).toBe(350);
  });

  it("returns zero for an unknown wilaya", () => {
    expect(findDeliveryFee(catalog, 31, "home")).toBe(0);
  });

  it("ignores non-livraison service fee rows", () => {
    const pickupOnlyCatalog = {
      ...catalog,
      serviceFees: [{ serviceType: "pickup", wilayaId: 16, homeFee: "999", stopDeskFee: "999" }],
    };

    expect(findDeliveryFee(pickupOnlyCatalog, 16, "home")).toBe(0);
  });
});

describe("storefront-api featured groups", () => {
  it("keeps optional CTA fields when normalizing homepage groups", () => {
    const products: LegacyProduct[] = [
      {
        _id: "10",
        id: 10,
        slug: "roller",
        title: "Roller",
        title_ar: "رولر",
        description: "desc",
        description_ar: "desc ar",
        summary: "",
        summary_ar: "",
        features: [],
        features_ar: [],
        images: ["https://cdn.example.com/product.jpg"],
        price: 100,
        OldPrice: null,
        oldPrice: null,
        stock: 1,
        inStock: true,
        availabilityStatus: "in_stock",
        inventoryQuantity: 1,
        brand: "1",
        category: "1",
        sku: null,
        barcode: null,
        brandInfo: null,
        categoryInfo: null,
        parentCategoryInfo: null,
        specValues: [],
        specIcons: [],
        specDescs: [],
        specDescs_ar: [],
        summary2: "",
        summary2_ar: "",
        color: "",
        ShowPercentage: 0,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    ];

    const result = normalizeFeaturedGroup(
      {
        id: 8,
        name: "Homepage picks",
        cta: "Voir Plus",
        ctaAr: "اكتشف المزيد",
        link: "/products?featured=1",
        sortOrder: 0,
        showAtTopOfProductsPage: false,
        active: true,
        productIds: [10],
        brandIds: [],
        categoryIds: [],
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
      products,
    );

    expect(result.cta).toBe("Voir Plus");
    expect(result.ctaAr).toBe("اكتشف المزيد");
    expect(result.link).toBe("/products?featured=1");
  });
});
