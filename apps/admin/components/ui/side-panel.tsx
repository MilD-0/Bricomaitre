'use client';

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import * as React from 'react';

import { rootMotionTransition } from '../../lib/design-tokens';
import { cn } from '../../lib/utils';
import { useModal } from './use-modal';

export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  closeLabel,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  closeLabel: string;
  dismissible?: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen || dismissible) onOpenChange(nextOpen);
  };
  const mounted = useModal(open, contentRef, changeOpen);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex justify-end bg-foreground/10 p-0 backdrop-blur-sm sm:p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 cursor-default"
            onPointerDown={(event) => {
              event.preventDefault();
              changeOpen(false);
            }}
          />
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              'relative z-10 flex h-full w-full flex-col overflow-hidden bg-[var(--glass-surface)] shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl focus:outline-none sm:max-w-[48rem] sm:rounded-[var(--shape-radius-overlay)] sm:border sm:border-border/60',
              className,
            )}
            initial={{ opacity: 0, x: '4%', filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: '3%', filter: 'blur(4px)' }}
            transition={rootMotionTransition('--duration-standard')}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start gap-4 border-b border-border/60 bg-background/72 px-4 py-4 backdrop-blur-xl sm:px-6">
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="text-lg font-semibold tracking-[var(--type-tracking-n015)] sm:text-xl"
                >
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => changeOpen(false)}
                disabled={!dismissible}
                className="grid size-9 shrink-0 place-items-center rounded-[var(--shape-radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50"
                aria-label={closeLabel}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer ? (
              <footer className="shrink-0 border-t border-border/60 bg-background/78 px-4 py-3 backdrop-blur-xl sm:px-6">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
