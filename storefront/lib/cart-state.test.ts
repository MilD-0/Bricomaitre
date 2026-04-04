import { describe, expect, it } from "vitest";

import {
  buildCartProductSummary,
  mergeCartProductSnapshots,
  toCartProductSnapshot,
} from "./cart-state";

describe("cart-state", () => {
  it("creates stable product snapshots for cart rendering", () => {
    expect(toCartProductSnapshot({
      _id: "12",
      slug: "hammer",
      title: "Hammer",
      title_ar: "مطرقة",
      images: ["https://example.com/hammer.jpg"],
      price: "450",
      OldPrice: "500",
      stock: 3,
      inStock: true,
      availabilityStatus: "in_stock",
      updatedAt: "2026-04-04T00:00:00.000Z",
    })).toEqual({
      _id: "12",
      slug: "hammer",
      title: "Hammer",
      title_ar: "مطرقة",
      summary: "",
      summary_ar: "",
      images: ["https://example.com/hammer.jpg"],
      price: 450,
      OldPrice: 500,
      oldPrice: 500,
      stock: 3,
      inStock: true,
      availabilityStatus: "in_stock",
      updatedAt: "2026-04-04T00:00:00.000Z",
    });
  });

  it("merges snapshots and derives subtotal from duplicate cart ids", () => {
    const snapshots = mergeCartProductSnapshots({}, [
      { _id: "12", title: "Hammer", price: 450, slug: "hammer" },
      { _id: "13", title: "Saw", price: 200, slug: "saw" },
    ]);

    expect(buildCartProductSummary(["12", "13", "12"], snapshots)).toEqual({
      items: [
        {
          productId: "12",
          quantity: 2,
          product: expect.objectContaining({ _id: "12", price: 450 }),
          lineTotal: 900,
          available: true,
        },
        {
          productId: "13",
          quantity: 1,
          product: expect.objectContaining({ _id: "13", price: 200 }),
          lineTotal: 200,
          available: true,
        },
      ],
      subtotal: 1100,
      quantityById: {
        "12": 2,
        "13": 1,
      },
    });
  });
});
