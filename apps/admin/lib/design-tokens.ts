import type { Transition } from 'motion/react';

type MotionDurationToken =
  '--duration-fast' | '--duration-standard' | '--duration-deliberate' | '--duration-navigation';

const FALLBACK_EASE = [0.22, 1, 0.36, 1] as const;

const FALLBACK_DURATION_SECONDS: Record<MotionDurationToken, number> = {
  '--duration-fast': 0.18,
  '--duration-standard': 0.2,
  '--duration-deliberate': 0.24,
  '--duration-navigation': 0.3,
};

function rootTokenValue(name: string) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function parseDurationSeconds(value: string, fallback: number) {
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  return match[2] === 'ms' ? amount / 1000 : amount;
}

export function parseCubicBezier(value: string) {
  const match = value
    .trim()
    .match(
      /^cubic-bezier\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)$/,
    );
  if (!match) return FALLBACK_EASE;
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])] as const;
}

/**
 * Motion's JavaScript API requires numeric seconds and bezier coordinates.
 * Resolve those values from the same root CSS controls used by CSS transitions
 * so changing the design language does not require editing component code.
 */
export function rootMotionTransition(
  durationToken: MotionDurationToken = '--duration-deliberate',
): Transition {
  return {
    duration: parseDurationSeconds(
      rootTokenValue(durationToken),
      FALLBACK_DURATION_SECONDS[durationToken],
    ),
    ease: parseCubicBezier(rootTokenValue('--ease-standard')),
  };
}
