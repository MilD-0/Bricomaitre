import { describe, expect, it } from "vitest";

import { getDisplayImages } from "./image-order";

describe("getDisplayImages", () => {
  it("preserves the upstream image order", () => {
    expect(getDisplayImages(["/one.jpg", "/two.jpg", "/three.jpg"])).toEqual([
      "/one.jpg",
      "/two.jpg",
      "/three.jpg",
    ]);
  });

  it("drops empty image entries without reordering valid ones", () => {
    expect(getDisplayImages([null, "/one.jpg", undefined, "/two.jpg", ""])).toEqual([
      "/one.jpg",
      "/two.jpg",
    ]);
  });
});
