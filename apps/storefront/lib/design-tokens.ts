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

/** Resolve Motion's numeric duration from the storefront's root CSS controls. */
export function rootMotionDurationSeconds(name: `--sf-duration-${string}`, fallback: number) {
  return parseDurationSeconds(rootTokenValue(name), fallback);
}
