'use client';

import type { ComponentType, ReactNode, Ref } from 'react';
import { useRef } from 'react';

import { HandCoinsIcon } from '@/components/ui/hand-coins';
import { PhoneIcon } from '@/components/ui/phone';
import { TruckIcon } from '@/components/ui/truck';

type TrustIcon = 'confirmation' | 'payment' | 'delivery';
type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };
type AnimatedIcon = ComponentType<{ size?: number; ref?: Ref<AnimatedIconHandle> }>;

const icons: Record<TrustIcon, AnimatedIcon> = {
  confirmation: PhoneIcon,
  payment: HandCoinsIcon,
  delivery: TruckIcon,
};

export function ProductTrustSignal({ icon, children }: { icon: TrustIcon; children: ReactNode }) {
  const iconRef = useRef<AnimatedIconHandle>(null);
  const Icon = icons[icon];

  function startAnimation() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    iconRef.current?.startAnimation();
  }

  return (
    <li onMouseEnter={startAnimation} onMouseLeave={() => iconRef.current?.stopAnimation()}>
      <span aria-hidden="true"><Icon ref={iconRef} size={16} /></span>
      {children}
    </li>
  );
}
