import { describe, expect, it } from "vitest";

import {
  buildCartProductSummary,
  buildCartTrackingProducts,
  canonicalizeCartProducts,
  findProductSnapshotByToken,
  mergeCartProductSnapshots,
  normalizeCartProductSnapshots,
  toCartProductSnapshot,
  withTrackingPrice,
} from "./cart-state";

describe("cart-state", () => {
  it("creates stable product snapshots for cart rendering", () => {
    expect(toCartProductSnapshot({
      _id: "12",
      id: 12,
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
      id: 12,
      mongo_id: null,
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

  it("uses numeric product ids as canonical snapshots and keeps Mongo ids as aliases", () => {
    const snapshot = toCartProductSnapshot({
      _id: "f00000000000000000000005",
      id: 2137,
      mongo_id: "f00000000000000000000005",
      slug: "perforateur-hitachi",
      title: "Perforateur",
      price: 12000,
    });

    expect(snapshot).toEqual(expect.objectContaining({
      _id: "2137",
      id: 2137,
      mongo_id: "f00000000000000000000005",
    }));
    expect(canonicalizeCartProducts(
      ["f00000000000000000000005", "2137"],
      [snapshot],
    )).toEqual(["2137", "2137"]);
  });

  it("normalizes legacy snapshot maps without losing ObjectId lookup", () => {
    const snapshots = normalizeCartProductSnapshots({
      "f00000000000000000000005": {
        ...toCartProductSnapshot({
          _id: "f00000000000000000000005",
          id: 2137,
          title: "Perforateur",
          price: 12000,
        }),
        mongo_id: null,
      },
    });

    expect(snapshots["2137"]).toEqual(expect.objectContaining({
      _id: "2137",
      mongo_id: "f00000000000000000000005",
    }));
    expect(findProductSnapshotByToken(snapshots, "f00000000000000000000005")?._id).toBe("2137");
    expect(buildCartProductSummary(["f00000000000000000000005"], snapshots).quantityById)
      .toEqual({ "2137": 1 });
  });

  it("merges snapshots and derives subtotal from duplicate cart ids", () => {
    const snapshots = mergeCartProductSnapshots({}, [
      { _id: "12", id: 12, title: "Hammer", price: 450, slug: "hammer" },
      { _id: "13", id: 13, title: "Saw", price: 200, slug: "saw" },
    ]);

    expect(buildCartProductSummary(["12", "13", "12"], snapshots)).toEqual({
      items: [
        {
          productId: "12",
          quantity: 2,
          product: expect.objectContaining({ _id: "12", id: 12, price: 450 }),
          lineTotal: 900,
          available: true,
        },
        {
          productId: "13",
          quantity: 1,
          product: expect.objectContaining({ _id: "13", id: 13, price: 200 }),
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

  it("returns the same snapshot object when merged products are unchanged", () => {
    const current = mergeCartProductSnapshots({}, [
      { _id: "12", id: 12, title: "Hammer", price: 450, slug: "hammer", images: ["https://example.com/hammer.jpg"] },
    ]);

    const merged = mergeCartProductSnapshots(current, [
      { _id: "12", id: 12, title: "Hammer", price: 450, slug: "hammer", images: ["https://example.com/hammer.jpg"] },
    ]);

    expect(merged).toBe(current);
  });

  it("preserves aggregated quantities for cart tracking", () => {
    const snapshots = mergeCartProductSnapshots({}, [
      { _id: "12", id: 12, title: "Hammer", price: 450, slug: "hammer" },
    ]);
    const summary = buildCartProductSummary(["12", "12"], snapshots);

    expect(buildCartTrackingProducts(summary.items)).toEqual([
      expect.objectContaining({ id: 12, price: 450, quantity: 2 }),
    ]);
  });

  it("uses an effective tracking price without mutating the cart product", () => {
    const product = { id: 12, price: 450 };

    expect(withTrackingPrice(product, 400)).toEqual({ id: 12, price: 400 });
    expect(product.price).toBe(450);
  });
});
