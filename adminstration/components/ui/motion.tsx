'use client';

import * as React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

import { cn } from '../../lib/utils';
import { Spinner } from './spinner';

const defaultTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const sectionTransitionProps = {
  initial: { opacity: 0, y: 16, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: defaultTransition,
};

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig transition={defaultTransition}>{children}</MotionConfig>;
}

export function PageTransition({
  routeKey,
  className,
  children,
}: {
  routeKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 18, filter: 'blur(12px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
        transition={defaultTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function PendingInline({
  active,
  label,
  className,
}: {
  active: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('min-h-4', className)} aria-live="polite">
      <motion.div
        initial={false}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : -4 }}
        transition={{ duration: 0.18, ease: defaultTransition.ease }}
        className={cn('inline-flex items-center gap-2 text-xs font-medium text-muted-foreground', !active && 'pointer-events-none')}
      >
        <Spinner className="size-3.5" />
        <span>{label}</span>
      </motion.div>
    </div>
  );
}

export function SurfacePendingOverlay({
  active,
  label,
  className,
}: {
  active: boolean;
  label: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : -6 }}
      transition={{ duration: 0.18, ease: defaultTransition.ease }}
      aria-hidden={!active}
      className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-3 py-3 sm:px-4', className)}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/92 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
        <Spinner className="size-3.5" />
        <span>{label}</span>
      </div>
    </motion.div>
  );
}
