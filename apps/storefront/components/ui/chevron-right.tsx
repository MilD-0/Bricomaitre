'use client';

import type { Transition } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';

import { rootMotionDurationSeconds } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

interface ChevronRightIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

function defaultTransition(): Transition {
  return {
    times: [0, 0.4, 1],
    duration: rootMotionDurationSeconds('--sf-duration-slow', 0.5),
  };
}

export function ChevronRightIcon({
  onMouseEnter,
  onMouseLeave,
  className,
  size = 28,
  ...props
}: ChevronRightIconProps) {
  const controls = useAnimation();
  return (
    <div
      className={cn(className)}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        void controls.start('animate');
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        void controls.start('normal');
      }}
      {...props}
    >
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          animate={controls}
          d="m9 18 6-6-6-6"
          transition={defaultTransition()}
          variants={{
            normal: { x: 0 },
            animate: { x: [0, 2, 0] },
          }}
        />
      </svg>
    </div>
  );
}
