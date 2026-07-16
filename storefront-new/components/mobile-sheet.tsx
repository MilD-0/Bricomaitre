'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function MobileSheet({
  title,
  ariaLabel,
  closeLabel,
  className = '',
  headerAction,
  children,
  footer,
  onClose,
}: {
  title: string;
  ariaLabel?: string;
  closeLabel: string;
  className?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>('*') ?? [])].filter((element) => (
        element.matches('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled)') && element.tabIndex >= 0
      ));
      if (!focusable.length) return;
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === closeRef.current) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyboard);
    };
  }, []);

  return createPortal(
    <div className="mobile-sheet-layer">
      <button className="mobile-sheet-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <aside
        ref={sheetRef}
        className={`mobile-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
      >
        <header className="mobile-sheet-header">
          <div className="mobile-sheet-header-title"><h2 id={titleId}>{title}</h2>{headerAction}</div>
          <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose}>
            <X aria-hidden="true" size={22} />
          </button>
        </header>
        <div className="mobile-sheet-body">{children}</div>
        {footer ? <footer className="mobile-sheet-footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
