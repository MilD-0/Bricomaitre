import { HandCoins, Phone, Truck } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

type TrustIcon = 'confirmation' | 'payment' | 'delivery';
type TrustIconComponent = ComponentType<{ size?: number }>;

const icons: Record<TrustIcon, TrustIconComponent> = {
  confirmation: Phone,
  payment: HandCoins,
  delivery: Truck,
};

export function ProductTrustSignal({ icon, children }: { icon: TrustIcon; children: ReactNode }) {
  const Icon = icons[icon];

  return (
    <li data-trust-icon={icon}>
      <span aria-hidden="true"><Icon size={16} /></span>
      {children}
    </li>
  );
}
