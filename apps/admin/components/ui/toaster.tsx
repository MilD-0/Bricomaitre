'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';
import {
  dismissToast,
  getToastSnapshot,
  subscribeToToasts,
  type ToastRecord,
  type ToastTone,
} from '../../lib/toast';

const toneStyles: Record<
  ToastTone,
  { card: string; icon: string; progress: string; Icon: typeof LoaderCircle; label: string }
> = {
  loading: {
    card: 'border-border/70 bg-card/95 text-card-foreground',
    icon: 'bg-secondary text-secondary-foreground',
    progress: 'from-border via-foreground/55 to-border',
    Icon: LoaderCircle,
    label: 'Loading',
  },
  success: {
    card: 'border-border/70 bg-card/95 text-card-foreground',
    icon: 'bg-primary text-primary-foreground',
    progress: 'from-primary/30 via-primary to-chart-2/45',
    Icon: CheckCircle2,
    label: 'Success',
  },
  error: {
    card: 'border-destructive/25 bg-card/95 text-card-foreground',
    icon: 'bg-destructive text-destructive-foreground',
    progress: 'from-destructive/30 via-destructive to-destructive/55',
    Icon: AlertCircle,
    label: 'Error',
  },
};

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToastSnapshot, getToastSnapshot);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  const criticalToasts = toasts.filter(
    (toast) => toast.priority === 'critical' || toast.scope === 'modal-safe',
  );
  const standardToasts = toasts.filter(
    (toast) => toast.priority !== 'critical' && toast.scope !== 'modal-safe',
  );

  return createPortal(
    <>
      <ToastStack toasts={standardToasts} className="z-100" />
      <ToastStack toasts={criticalToasts} className="z-[120]" />
    </>,
    document.body,
  );
}

function ToastStack({ className, toasts }: { className: string; toasts: ToastRecord[] }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-4 flex w-full flex-col gap-3 px-4 sm:inset-x-auto sm:end-6 sm:bottom-6 sm:max-w-sm sm:px-0',
        className,
      )}
    >
      {toasts.map((toast) => {
        const { Icon, card, icon, label, progress } = toneStyles[toast.tone];

        return (
          <div
            key={toast.id}
            role="status"
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto overflow-hidden rounded-[1.5rem] border shadow-[var(--shadow-vapor-strong)]',
              card,
            )}
          >
            <div className="bg-linear-to-r from-muted/45 via-background/80 to-background/60 p-1">
              <div className="flex items-start gap-3 rounded-[calc(1.5rem-0.25rem)] px-3.5 py-3">
                <div
                  className={cn(
                    'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[1rem] shadow-[var(--shadow-vapor)]',
                    icon,
                  )}
                >
                  <Icon className={cn('size-[18px]', toast.tone === 'loading' && 'animate-spin')} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                    {toast.message}
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className={cn('h-1 w-full bg-linear-to-r', progress)} />
          </div>
        );
      })}
    </div>
  );
}
