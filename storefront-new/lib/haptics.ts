type HapticFeedback = 'selection' | 'light' | 'medium' | 'success';

type HapticsClient = {
  trigger: (feedback: HapticFeedback) => Promise<void>;
};

let clientPromise: Promise<HapticsClient | null> | null = null;

export function isHapticDevice() {
  if (typeof navigator === 'undefined') return false;

  return navigator.maxTouchPoints > 0 || 'vibrate' in navigator;
}

function getClient() {
  if (!isHapticDevice()) return Promise.resolve(null);
  if (clientPromise) return clientPromise;

  clientPromise = import('web-haptics')
    .then(({ WebHaptics }) => new WebHaptics({ debug: false, showSwitch: false }))
    .catch(() => null);

  return clientPromise;
}

/** Load the optional mobile enhancement after hydration, outside the initial bundle. */
export async function prepareHaptics() {
  await getClient();
}

/** Haptic feedback must never delay or break the customer action it enhances. */
export async function triggerHaptic(feedback: HapticFeedback) {
  try {
    await (await getClient())?.trigger(feedback);
  } catch {
    // Haptics are a non-blocking progressive enhancement.
  }
}
