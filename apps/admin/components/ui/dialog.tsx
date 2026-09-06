'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../../lib/utils';
import { useModal } from './use-modal';

type DialogContextValue = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  descriptionId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

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
  const contentRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const mounted = useModal(open, contentRef, onOpenChange);

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
                onOpenChange(false);
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

export function DialogContent({
  className,
  onPointerDown,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
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
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      className={cn(
        'relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[var(--shape-radius-overlay)] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl focus:outline-hidden',
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
