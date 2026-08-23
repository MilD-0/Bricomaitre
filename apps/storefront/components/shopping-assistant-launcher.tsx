'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { MessageCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackNavigationEvent } from '@/lib/analytics';
import { recordAssistantOpen } from '@/lib/assistant-attribution';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import { resetMobilePageZoom } from '@/lib/mobile-page-zoom';
import type { ShoppingAssistantLabels } from '@/components/shopping-assistant-panel';

const ShoppingAssistantPanel = dynamic(
  () =>
    import('@/components/shopping-assistant-panel').then((module) => module.ShoppingAssistantPanel),
  { ssr: false },
);

export function ShoppingAssistantLauncher({
  locale,
  labels,
}: {
  locale: Locale;
  labels: ShoppingAssistantLabels;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isProductDetail = /\/products\/[^/]+\/?$/.test(pathname);

  function showAssistant() {
    resetMobilePageZoom();
    setOpen(true);
    void triggerHaptic('surface');
    recordAssistantOpen(getAnalyticsIdentity());
    void trackNavigationEvent({
      eventName: 'ai_assistant_open',
      locale,
      metadata: { surface: 'ai_assistant', target: 'launcher' },
    });
  }

  return (
    <>
      {!open ? (
        <button
          className={`shopping-assistant-launcher${isProductDetail ? ' is-product-detail' : ''}`}
          type="button"
          onPointerEnter={() => void prepareHaptics()}
          onFocus={() => void prepareHaptics()}
          onClick={showAssistant}
          aria-label={labels.open}
        >
          <span className="shopping-assistant-launcher-icon">
            <MessageCircle aria-hidden="true" size={22} />
            <Sparkles className="shopping-assistant-launcher-spark" aria-hidden="true" size={11} />
          </span>
          <span>{labels.open}</span>
        </button>
      ) : (
        <ShoppingAssistantPanel
          locale={locale}
          labels={labels}
          pathname={pathname}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
