'use client';

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

type ModalEntry = { content: RefObject<HTMLElement | null> };
const openModals: ModalEntry[] = [];
let originalOverflow = '';
let originalFocus: HTMLElement | null = null;

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input:not([type="hidden"]), select, [tabindex]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      (typeof element.checkVisibility !== 'function' ||
        element.checkVisibility({ checkVisibilityCSS: true })),
  );
}

export function useModal(
  open: boolean,
  content: RefObject<HTMLElement | null>,
  onOpenChange: (open: boolean) => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openModals.length === 0) {
      originalOverflow = document.body.style.overflow;
      originalFocus = previousFocus;
      document.body.style.overflow = 'hidden';
    }
    const entry = { content };
    openModals.push(entry);
    const focusFirst = () => (focusableElements(content.current)[0] ?? content.current)?.focus();
    const frame = requestAnimationFrame(() => {
      if (openModals.at(-1) === entry) {
        if (initialFocus?.current) initialFocus.current.focus();
        else focusFirst();
      }
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || openModals.at(-1) !== entry) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const elements = focusableElements(content.current);
        const current = elements.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? current <= 0
            ? elements.length - 1
            : current - 1
          : current === elements.length - 1
            ? 0
            : current + 1;
        (elements[next] ?? content.current)?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = openModals.at(-1) === entry;
      openModals.splice(openModals.indexOf(entry), 1);
      const remaining = openModals.at(-1);
      if (!remaining) {
        document.body.style.overflow = originalOverflow;
        if (originalFocus?.isConnected) originalFocus.focus();
        originalFocus = null;
      } else if (wasTop) {
        if (previousFocus?.isConnected && remaining.content.current?.contains(previousFocus))
          previousFocus.focus();
        else
          (focusableElements(remaining.content.current)[0] ?? remaining.content.current)?.focus();
      }
    };
  }, [open, mounted, content, initialFocus]);
  return mounted;
}
