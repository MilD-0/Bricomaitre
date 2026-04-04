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
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="pending"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={cn('inline-flex items-center gap-2 text-xs font-medium text-muted-foreground', className)}
        >
          <Spinner className="size-3.5" />
          <span>{label}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
