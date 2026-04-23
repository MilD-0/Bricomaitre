import { describe, expect, it } from "vitest";

import {
  isPaidTrafficCookieValue,
  parseCookieValue,
} from "./paid-session";

describe("paid-session helpers", () => {
  it("reads the paid click cookie from a cookie string", () => {
    expect(parseCookieValue("foo=bar; bric_paid_click=1; hello=world", "bric_paid_click")).toBe("1");
  });

  it("treats only 1 as a paid session", () => {
    expect(isPaidTrafficCookieValue("1")).toBe(true);
    expect(isPaidTrafficCookieValue("0")).toBe(false);
    expect(isPaidTrafficCookieValue(null)).toBe(false);
  });
});
