const recentMetaEvents = new Map();
let navigationSequence = 0;
let navigationTrackingInstalled = false;

export const META_EVENT_DEDUPE_WINDOW_MS = 10_000;

function installNavigationTracking() {
  if (navigationTrackingInstalled || typeof window === "undefined") return;
  navigationTrackingInstalled = true;

  window.addEventListener("popstate", () => {
    navigationSequence += 1;
  });
}

export function getMetaNavigationKey() {
  installNavigationTracking();
  return `${navigationSequence}:${window.location.href}`;
}

export function advanceMetaNavigationForTests() {
  navigationSequence += 1;
}

export function runMetaEventOnce(
  key,
  callback,
  {
    now = Date.now,
    windowMs = META_EVENT_DEDUPE_WINDOW_MS,
  } = {},
) {
  const startedAt = now();
  const existing = recentMetaEvents.get(key);
  if (existing && startedAt - existing.startedAt <= windowMs) {
    return existing.promise;
  }

  const promise = Promise.resolve().then(callback);
  recentMetaEvents.set(key, { promise, startedAt });
  void promise.catch(() => {
    if (recentMetaEvents.get(key)?.promise === promise) {
      recentMetaEvents.delete(key);
    }
  });
  return promise;
}

export function clearMetaEventDedupeForTests() {
  recentMetaEvents.clear();
  navigationSequence = 0;
}
