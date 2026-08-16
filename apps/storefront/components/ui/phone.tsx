'use client';

import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface PhoneIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PhoneIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PhoneIcon = forwardRef<PhoneIconHandle, PhoneIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const animationRef = useRef<Animation | null>(null);
    const isControlledRef = useRef(false);

    const startAnimation = useCallback(() => {
      if (!svgRef.current?.animate) return;
      animationRef.current?.cancel();
      animationRef.current = svgRef.current.animate(
        [
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(20deg) scale(1.1)', offset: 0.25 },
          { transform: 'rotate(-10deg) scale(1.06)', offset: 0.5 },
          { transform: 'rotate(10deg) scale(1.03)', offset: 0.75 },
          { transform: 'rotate(0deg) scale(1)' },
        ],
        { duration: 700, easing: 'ease-in-out' },
      );
    }, []);

    const stopAnimation = useCallback(() => {
      animationRef.current?.cancel();
      animationRef.current = null;
    }, []);

    useImperativeHandle(ref, () => {
      isControlledRef.current = ref != null;
      return {
        startAnimation,
        stopAnimation,
      };
    }, [ref, startAnimation, stopAnimation]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          startAnimation();
        }
      },
      [onMouseEnter, startAnimation],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          stopAnimation();
        }
      },
      [onMouseLeave, stopAnimation],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          ref={svgRef}
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
          <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
        </svg>
      </div>
    );
  },
);

PhoneIcon.displayName = 'PhoneIcon';

export { PhoneIcon };
