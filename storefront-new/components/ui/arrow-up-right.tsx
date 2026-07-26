"use client";

import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ArrowUpRightIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ArrowUpRightIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ArrowUpRightIcon = forwardRef<
  ArrowUpRightIconHandle,
  ArrowUpRightIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const arrowRef = useRef<SVGGElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const isControlledRef = useRef(false);

  const startAnimation = useCallback(() => {
    if (!arrowRef.current?.animate) return;
    animationRef.current?.cancel();
    animationRef.current = arrowRef.current.animate([
      { transform: "translate(0, 0) scale(1)" },
      { transform: "translate(-4px, 4px) scale(.85)", offset: 0.5 },
      { transform: "translate(0, 0) scale(1)" },
    ], { duration: 500, easing: "ease-in-out" });
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
      if (!isControlledRef.current) startAnimation();
      onMouseEnter?.(e);
    },
    [onMouseEnter, startAnimation]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current) stopAnimation();
      onMouseLeave?.(e);
    },
    [onMouseLeave, stopAnimation]
  );

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
        <g ref={arrowRef} style={{ transformOrigin: "17px 7px" }}>
          <path d="M7 7H17" />
          <path d="M17 7V17" />
          <path d="M7 17L17 7" />
        </g>
      </svg>
    </div>
  );
});

ArrowUpRightIcon.displayName = "ArrowUpRightIcon";

export { ArrowUpRightIcon };
