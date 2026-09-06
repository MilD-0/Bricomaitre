'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

interface XIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
  },
};

export function XIcon({ onMouseEnter, onMouseLeave, className, size = 28, ...props }: XIconProps) {
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
        <motion.path animate={controls} d="M18 6 6 18" variants={PATH_VARIANTS} />
        <motion.path
          animate={controls}
          d="m6 6 12 12"
          transition={{ delay: 0.2 }}
          variants={PATH_VARIANTS}
        />
      </svg>
    </div>
  );
}
