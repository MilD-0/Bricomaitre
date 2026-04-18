import { beforeEach, describe, expect, it, vi } from "vitest";

const { readCatalogFeedMock } = vi.hoisted(() => ({
  readCatalogFeedMock: vi.fn(),
}));

vi.mock("../../../../lib/catalog-feed", () => ({
  readCatalogFeed: readCatalogFeedMock,
}));

import { GET } from "./route";

describe("app/storefront/products/catalog-feed/route", () => {
  beforeEach(() => {
    readCatalogFeedMock.mockReset();
  });

  it("streams the CSV feed with cache headers", async () => {
    readCatalogFeedMock.mockResolvedValue({
      body: Buffer.from("id,content_id\n1,1\n"),
      contentType: "text/csv; charset=utf-8",
      lastModified: new Date("2026-04-17T00:00:00.000Z"),
      etag: '"abc123"',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="meta-catalog-feed.csv"',
    );
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(response.headers.get("last-modified")).toBe("Fri, 17 Apr 2026 00:00:00 GMT");
    expect(response.headers.get("etag")).toBe('"abc123"');
    await expect(response.text()).resolves.toBe("id,content_id\n1,1\n");
  });

  it("returns 503 when the feed cannot be read", async () => {
    readCatalogFeedMock.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Catalog feed is unavailable",
    });
  });
});
