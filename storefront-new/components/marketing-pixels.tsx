'use client';

import { useEffect } from 'react';

import { captureMarketingAttribution } from '@/lib/marketing-attribution';
import { loadMarketingDestinationScripts, prepareMarketingDestinations } from '@/lib/marketing-destinations';

export const MARKETING_SCRIPT_FALLBACK_DELAY_MS = 10_000;

export function MarketingPixels() {
  useEffect(() => {
    captureMarketingAttribution();
    prepareMarketingDestinations();
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (started) return;
      started = true;
      if (timer) globalThis.clearTimeout(timer);
      loadMarketingDestinationScripts();
    };
    const scheduleFallback = () => {
      timer ??= globalThis.setTimeout(start, MARKETING_SCRIPT_FALLBACK_DELAY_MS);
    };

    if (document.readyState === 'complete') scheduleFallback();
    else window.addEventListener('load', scheduleFallback, { once: true });
    window.addEventListener('click', start, { once: true, passive: true });
    window.addEventListener('keydown', start, { once: true, passive: true });

    return () => {
      window.removeEventListener('load', scheduleFallback);
      window.removeEventListener('click', start);
      window.removeEventListener('keydown', start);
      if (timer) globalThis.clearTimeout(timer);
    };
  }, []);
  return null;
}
