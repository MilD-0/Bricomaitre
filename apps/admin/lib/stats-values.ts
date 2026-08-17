export function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function numberOrZero(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
