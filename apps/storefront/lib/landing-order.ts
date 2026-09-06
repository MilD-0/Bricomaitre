export const LANDING_ORDER_SECTION_ID = 'landing-order';

export function focusLandingOrder(href: string) {
  const target = document.querySelector<HTMLElement>(href);
  if (!target) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(window.history.state, '', href);
  window.requestAnimationFrame(() =>
    target.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true }),
  );
}
