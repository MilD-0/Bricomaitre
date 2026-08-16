type HapticFeedback =
  'navigation' | 'control' | 'surface' | 'primary' | 'success' | 'error' | 'destructive';

type HapticPreset = {
  description: string;
  pattern: Array<{ duration: number; intensity: number; delay?: number }>;
};

/**
 * Deliberately more tactile than the library defaults. Each feedback class maps
 * to the weight of the customer decision, so routine navigation stays quiet
 * while cart, order, and destructive actions feel clearly intentional.
 */
const STOREFRONT_HAPTICS: Record<HapticFeedback, HapticPreset> = {
  navigation: {
    description: 'A restrained pulse for moving between pages',
    pattern: [{ duration: 22, intensity: 0.58 }],
  },
  control: {
    description: 'A crisp response for toggles, quantities, and media controls',
    pattern: [{ duration: 30, intensity: 0.72 }],
  },
  surface: {
    description: 'A confident pulse for opening or closing a sheet, drawer, or zoom view',
    pattern: [{ duration: 38, intensity: 0.84 }],
  },
  primary: {
    description: 'A two-stage commitment for checkout, purchase, filters, and calling support',
    pattern: [
      { duration: 42, intensity: 0.92 },
      { delay: 54, duration: 30, intensity: 0.72 },
    ],
  },
  success: {
    description: 'A satisfying rising confirmation after a completed action',
    pattern: [
      { duration: 30, intensity: 0.66 },
      { delay: 56, duration: 68, intensity: 1 },
    ],
  },
  error: {
    description: 'A short, unmistakable failure signal without a harsh buzz',
    pattern: [
      { duration: 42, intensity: 0.88 },
      { delay: 46, duration: 42, intensity: 0.8 },
    ],
  },
  destructive: {
    description: 'A firm single pulse before removing an item',
    pattern: [{ duration: 52, intensity: 0.96 }],
  },
};

type HapticsClient = {
  trigger: (feedback: HapticPreset) => Promise<void>;
};

let clientPromise: Promise<HapticsClient | null> | null = null;

function isHapticDevice() {
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
    await (await getClient())?.trigger(STOREFRONT_HAPTICS[feedback]);
  } catch {
    // Haptics are a non-blocking progressive enhancement.
  }
}
