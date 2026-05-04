import { describe, expect, it, vi } from "vitest";

import {
  normalizeStorefrontProject,
  resolveRequestedStorefrontProject,
  STOREFRONT_PROJECT_COOKIE_NAME,
} from "@bric/storefront-core/project-routing";

import { getRequestedStorefrontProject } from "./storefront-project";

describe("storefront project routing helpers", () => {
  it("normalizes projects from query/cookies", () => {
    expect(normalizeStorefrontProject("legacy")).toBe("new");
    expect(normalizeStorefrontProject("new")).toBe("new");
    expect(normalizeStorefrontProject("fast_checkout")).toBe("new");
    expect(normalizeStorefrontProject("control")).toBe(null);
    expect(normalizeStorefrontProject("something_else")).toBe(null);
  });

  it("resolves query param over cookie and falls back to new", () => {
    expect(
      resolveRequestedStorefrontProject({ queryValue: "legacy", cookieValue: "new" }),
    ).toBe("new");
    expect(resolveRequestedStorefrontProject({ cookieValue: "legacy" })).toBe("new");
    expect(resolveRequestedStorefrontProject({ queryValue: "control", cookieValue: "legacy" })).toBe("new");
    expect(resolveRequestedStorefrontProject({ queryValue: "control" })).toBe("new");
    expect(resolveRequestedStorefrontProject({ queryValue: "wat" })).toBe("new");
  });

  it("reads the requested storefront project from the browser environment", () => {
    vi.stubGlobal("window", {
      location: { search: "?sf_variant=fast_checkout" },
    });
    vi.stubGlobal("document", {
      cookie: `${STOREFRONT_PROJECT_COOKIE_NAME}=legacy`,
    });

    expect(getRequestedStorefrontProject()).toBe("new");
  });
});
