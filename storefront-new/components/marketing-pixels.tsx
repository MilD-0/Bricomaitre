'use client';

import { useEffect } from 'react';

import { captureMarketingAttribution } from '@/lib/marketing-attribution';
import { loadMarketingDestinationScripts, prepareMarketingDestinations } from '@/lib/marketing-destinations';

export function MarketingPixels() {
  useEffect(() => {
    captureMarketingAttribution();
    prepareMarketingDestinations();
    const start = () => loadMarketingDestinationScripts();
    const idle = window.requestIdleCallback?.bind(window);
    if (typeof idle === 'function') {
      const id = idle(start, { timeout: 2_000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(start, 1_000);
    return () => globalThis.clearTimeout(id);
  }, []);
  return null;
}
