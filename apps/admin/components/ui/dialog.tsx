'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../../lib/utils';

type DialogContextValue = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  descriptionId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

let openDialogCount = 0;

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
}

export function Dialog({
  open,
  onOpenChange,
  fullScreen = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullScreen?: boolean;
  children: React.ReactNode;
}) {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const contentRef = React.useRef<HTMLDivElement>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open || !mounted) {
      return;
    }

    openDialogCount += 1;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const focusDialog = () => {
      const focusable = getFocusableElements(contentRef.current);
      (focusable[0] ?? contentRef.current)?.focus();
    };

    const animationFrame = window.requestAnimationFrame(focusDialog);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(contentRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        contentRef.current?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusable.length - 1
          : currentIndex - 1
        : currentIndex === -1 || currentIndex === focusable.length - 1
          ? 0
          : currentIndex + 1;

      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', handleKeyDown);
      openDialogCount = Math.max(0, openDialogCount - 1);

      if (openDialogCount === 0) {
        document.body.style.overflow = previousOverflow;
      }

      previousActiveElement?.focus?.();
    };
  }, [mounted, open]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <DialogContext.Provider value={{ contentRef, titleId, descriptionId }}>
      <AnimatePresence>
        {open ? (
          <motion.div
            className={cn(
              'fixed inset-0 z-[100] flex justify-center overflow-y-auto',
              fullScreen ? 'items-stretch p-0' : 'items-start p-4 sm:items-center',
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              type="button"
              aria-label="Close dialog overlay"
              className="absolute inset-0 bg-foreground/10 backdrop-blur-xl"
              onPointerDown={(event) => {
                event.preventDefault();
                onOpenChangeRef.current(false);
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className={cn('relative z-10 flex w-full justify-center', fullScreen && 'h-full')}
              initial={{ opacity: 0, y: 20, scale: 0.98, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 8, scale: 0.98, filter: 'blur(6px)' }}
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DialogContext.Provider>,
    document.body,
  );
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DialogContext);

  return (
    <div
      ref={context?.contentRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={context?.titleId}
      aria-describedby={context?.descriptionId}
      tabIndex={-1}
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick?.(event);
      }}
      className={cn(
        'relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl focus:outline-hidden',
        className,
      )}
      {...props}
    />
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const context = React.useContext(DialogContext);

  return <h2 id={context?.titleId} className={cn('text-lg font-semibold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const context = React.useContext(DialogContext);

  return (
    <p
      id={context?.descriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex items-center justify-end gap-2', className)} {...props} />;
}
