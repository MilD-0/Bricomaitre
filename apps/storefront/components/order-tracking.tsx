import { Check, CircleDot, Clock3, House, PackageOpen, Truck } from 'lucide-react';

import {
  customerOrderTrackingStages,
  getCustomerOrderTrackingState,
  type CustomerOrderTrackingStage,
  type CustomerOrderTrackingVariant,
} from '@/lib/order-tracking';
import type { StorefrontOrderResponseItem } from '@bric/storefront-core/contracts';

type TrackingLabels = Record<CustomerOrderTrackingStage, string> & {
  title: string;
  live: string;
  delayed: string;
  cancelled: string;
  returned: string;
  failed: string;
};

const stageIcons = [Clock3, PackageOpen, Truck, House] as const;

function exceptionLabel(variant: CustomerOrderTrackingVariant, labels: TrackingLabels) {
  return variant === 'delayed' ||
    variant === 'cancelled' ||
    variant === 'returned' ||
    variant === 'failed'
    ? labels[variant]
    : null;
}

export function OrderTracking({
  order,
  labels,
}: {
  order: StorefrontOrderResponseItem;
  labels: TrackingLabels;
}) {
  const state = getCustomerOrderTrackingState(order.confirmed);
  const exception = exceptionLabel(state.variant, labels);

  return (
    <section className="order-tracking" aria-labelledby="order-tracking-title">
      <header>
        <div>
          <span className="order-tracking-live">
            <CircleDot aria-hidden="true" />
            {labels.live}
          </span>
          <h2 id="order-tracking-title">{labels.title}</h2>
        </div>
        <span className="order-tracking-current">{labels[state.current]}</span>
      </header>

      <ol aria-label={labels.title}>
        {customerOrderTrackingStages.map((stage, index) => {
          const Icon = stageIcons[index];
          const complete = index < state.activeStage;
          const active = index === state.activeStage;
          return (
            <li
              key={stage}
              data-complete={complete || undefined}
              data-active={active || undefined}
              data-reached={complete || active || undefined}
              data-connector-complete={index < state.activeStage || undefined}
              aria-current={active ? 'step' : undefined}
            >
              <span className="order-tracking-node">
                {complete ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
              </span>
              <span className="order-tracking-label">{labels[stage]}</span>
            </li>
          );
        })}
      </ol>

      {exception ? (
        <p className={`order-tracking-alert is-${state.variant}`} role="status">
          {exception}
        </p>
      ) : null}
    </section>
  );
}
