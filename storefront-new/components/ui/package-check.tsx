'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface PackageCheckIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PackageCheckIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const packageVariants: Variants = {
  normal: { y: 0, rotate: 0 },
  animate: { y: [0, -1.5, 0], rotate: [0, -2, 0], transition: { duration: 0.42, ease: 'easeOut' } },
};

const checkVariants: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.38, ease: 'easeOut' } },
};

const PackageCheckIcon = forwardRef<PackageCheckIconHandle, PackageCheckIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseEnter?.(event);
      else controls.start('animate');
    }, [controls, onMouseEnter]);

    const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseLeave?.(event);
      else controls.start('normal');
    }, [controls, onMouseLeave]);

    return (
      <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <motion.svg animate={controls} variants={packageVariants} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l3-1.72" />
          <path d="M3.29 7 12 12l8.71-5" />
          <path d="M12 22V12" />
          <motion.path animate={controls} variants={checkVariants} d="m16 19 2 2 4-4" />
        </motion.svg>
      </div>
    );
  },
);

PackageCheckIcon.displayName = 'PackageCheckIcon';

export { PackageCheckIcon };
