'use client';

import type { Transition } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

interface ExpandIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
};

export function ExpandIcon({
  onMouseEnter,
  onMouseLeave,
  className,
  size = 28,
  ...props
}: ExpandIconProps) {
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
          d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"
          transition={DEFAULT_TRANSITION}
          variants={{
            normal: { translateX: '0%', translateY: '0%' },
            animate: { translateX: '2px', translateY: '2px' },
          }}
        />
        <motion.path
          animate={controls}
          d="M3 16.2V21m0 0h4.8M3 21l6-6"
          transition={DEFAULT_TRANSITION}
          variants={{
            normal: { translateX: '0%', translateY: '0%' },
            animate: { translateX: '-2px', translateY: '2px' },
          }}
        />
        <motion.path
          animate={controls}
          d="M21 7.8V3m0 0h-4.8M21 3l-6 6"
          transition={DEFAULT_TRANSITION}
          variants={{
            normal: { translateX: '0%', translateY: '0%' },
            animate: { translateX: '2px', translateY: '-2px' },
          }}
        />
        <motion.path
          animate={controls}
          d="M3 7.8V3m0 0h4.8M3 3l6 6"
          transition={DEFAULT_TRANSITION}
          variants={{
            normal: { translateX: '0%', translateY: '0%' },
            animate: { translateX: '-2px', translateY: '-2px' },
          }}
        />
      </svg>
    </div>
  );
}
