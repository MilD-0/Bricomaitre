'use client';

import type { StorefrontSettingsResponse } from '@bric/storefront-core/contracts';
import { useRef } from 'react';

import { PhoneIcon, type PhoneIconHandle } from '@/components/ui/phone';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

type SupportSurface = 'mobile_drawer' | 'product_detail' | 'checkout' | 'thank_you';

export type SupportContactLabels = {
  title: string;
  description?: string;
  call: string;
};

export function SupportContactActions({
  locale,
  contact,
  labels,
  surface,
  variant = 'inline',
}: {
  locale: Locale;
  contact: StorefrontSettingsResponse;
  labels: SupportContactLabels;
  surface: SupportSurface;
  variant?: 'drawer' | 'inline' | 'recovery' | 'panel';
}) {
  const phoneIconRef = useRef<PhoneIconHandle>(null);

  function activate() {
    prepareHaptics();
    void triggerHaptic('primary');
    void trackNavigationEvent({
      eventName: 'navigation_click',
      locale,
      metadata: { surface, target: 'call' },
    });
  }

  function start(icon: PhoneIconHandle | null) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    icon?.startAnimation();
  }

  return (
    <section className={`support-contact support-contact-${variant}`} aria-label={labels.title}>
      <div className="support-contact-copy">
        <strong>{labels.title}</strong>
        {labels.description ? <span>{labels.description}</span> : null}
      </div>
      <div className="support-contact-actions">
        <a
          className="support-contact-action support-contact-call"
          href={contact.phoneHref}
          dir="ltr"
          onPointerDown={prepareHaptics}
          onPointerEnter={() => start(phoneIconRef.current)}
          onPointerLeave={() => phoneIconRef.current?.stopAnimation()}
          onFocus={() => start(phoneIconRef.current)}
          onBlur={() => phoneIconRef.current?.stopAnimation()}
          onClick={activate}
        >
          <PhoneIcon ref={phoneIconRef} size={17} aria-hidden="true" />
          <span>{labels.call}</span>
          <b>{contact.phoneDisplay}</b>
        </a>
      </div>
    </section>
  );
}
