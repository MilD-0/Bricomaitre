import { afterEach, describe, expect, it, vi } from "vitest";

import {
  advanceMetaNavigationForTests,
  clearMetaEventDedupeForTests,
  runMetaEventOnce,
} from "./meta-event-dedupe";

afterEach(() => {
  clearMetaEventDedupeForTests();
});

describe("runMetaEventOnce", () => {
  it("shares one event execution across repeated mounts for the same navigation", async () => {
    const callback = vi.fn().mockResolvedValue({ eventId: "event-1" });

    const first = runMetaEventOnce("PageView:https://bricomaitre.com/products/1", callback);
    const second = runMetaEventOnce("PageView:https://bricomaitre.com/products/1", callback);

    await expect(first).resolves.toEqual({ eventId: "event-1" });
    await expect(second).resolves.toEqual({ eventId: "event-1" });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("allows different navigations and events after the dedupe window", async () => {
    let currentTime = 1_000;
    const now = () => currentTime;
    const callback = vi.fn().mockResolvedValue(null);

    await runMetaEventOnce("PageView:/products/1", callback, { now });
    await runMetaEventOnce("PageView:/products/2", callback, { now });
    currentTime = 11_001;
    await runMetaEventOnce("PageView:/products/1", callback, { now });

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("allows a failed event to be retried", async () => {
    const callback = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ eventId: "event-2" });

    await expect(runMetaEventOnce("ViewContent:/products/1:1", callback)).rejects.toThrow(
      "temporary failure",
    );
    await expect(runMetaEventOnce("ViewContent:/products/1:1", callback)).resolves.toEqual({
      eventId: "event-2",
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("allows the same event key again after a browser-history navigation", async () => {
    const callback = vi.fn().mockResolvedValue(null);
    await runMetaEventOnce("PageView:0:/products/1", callback);
    advanceMetaNavigationForTests();
    await runMetaEventOnce("PageView:1:/products/1", callback);

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
