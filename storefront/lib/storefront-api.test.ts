import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchStorefrontBrands,
  findDeliveryFee,
  hasStopDeskForWilaya,
  normalizeFeaturedGroup,
  normalizeFeaturedGroupLink,
  normalizeProduct,
  type LegacyProduct,
} from "./storefront-api";

describe("storefront-api upstream fallback logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PHASE;
  });

  it("keeps build-time read fallback logs when storefront-api is unavailable", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fetchStorefrontBrands()).resolves.toEqual([]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[storefront] upstream request failed for /api/storefront/brands during build",
      "Storefront API is unavailable: /api/storefront/brands",
    );
  });

  it("keeps runtime upstream fallback logs outside the build phase", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fetchStorefrontBrands()).resolves.toEqual([]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[storefront] upstream request failed for /api/storefront/brands during runtime",
      "Storefront API is unavailable: /api/storefront/brands",
    );
  });
});

describe("storefront-api product identity", () => {
  it("emits numeric ids as product _id while retaining Mongo as an alias", () => {
    const product = normalizeProduct({
      id: 2137,
      slug: "perforateur-hitachi",
      mongoId: "f00000000000000000000005",
      title: "Perforateur",
      titleAr: null,
      description: null,
      descriptionAr: null,
      sku: null,
      barcode: null,
      price: "12000",
      oldPrice: null,
      active: true,
      inStock: true,
      availabilityStatus: "in_stock",
      inventoryQuantity: 4,
      brandId: null,
      categoryId: null,
      images: [],
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    expect(product._id).toBe("2137");
    expect(product.id).toBe(2137);
    expect(product.mongo_id).toBe("f00000000000000000000005");
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

describe("storefront-api stop desk availability", () => {
  const catalog = {
    wilayas: [
      { wilayaId: 16, name: "Alger" },
      { wilayaId: 31, name: "Oran" },
    ],
    communes: [
      {
        communeId: 1,
        wilayaId: 16,
        name: "Bab Ezzouar",
        postalCode: "16024",
        hasStopDesk: false,
      },
      {
        communeId: 2,
        wilayaId: 16,
        name: "Dar El Beida",
        postalCode: "16033",
        hasStopDesk: true,
      },
      {
        communeId: 3,
        wilayaId: 31,
        name: "Es Senia",
        postalCode: "31000",
        hasStopDesk: false,
      },
    ],
    serviceFees: [],
    weightFees: [],
    lastSync: null,
  };

  it("returns true when any commune in the wilaya supports stop desk", () => {
    expect(hasStopDeskForWilaya(catalog, 16)).toBe(true);
  });

  it("returns false when no commune in the wilaya supports stop desk", () => {
    expect(hasStopDeskForWilaya(catalog, 31)).toBe(false);
  });
});

describe("storefront-api featured groups", () => {
  it("keeps optional CTA fields when normalizing homepage groups", () => {
    const products: LegacyProduct[] = [
      {
        _id: "10",
        mongo_id: null,
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
        nameAr: "اختيارات الصفحة الرئيسية",
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
    expect(result.titleAr).toBe("اختيارات الصفحة الرئيسية");
    expect(result.ctaAr).toBe("اكتشف المزيد");
    expect(result.link).toBe("/products?featured=1");
  });

  it("normalizes locale-prefixed featured-group links for locale-aware routing", () => {
    expect(normalizeFeaturedGroupLink("/products?brand=acme")).toBe("/products?brand=acme");
    expect(normalizeFeaturedGroupLink("/fr/products?brand=acme")).toBe("/products?brand=acme");
    expect(normalizeFeaturedGroupLink("/ar/products?brand=acme")).toBe("/products?brand=acme");
    expect(normalizeFeaturedGroupLink("https://example.com/products?brand=acme")).toBe("https://example.com/products?brand=acme");
    expect(normalizeFeaturedGroupLink("#top")).toBe("#top");
  });
});
