'use client';

import Script from 'next/script';
import { useEffect } from 'react';

import { captureMarketingAttribution } from '@/lib/marketing-attribution';
import { prepareMarketingDestinations } from '@/lib/marketing-destinations';

type MarketingPixelsProps = {
  metaPixelId: string | null;
};

export function MarketingPixels({ metaPixelId }: MarketingPixelsProps) {
  const normalizedMetaPixelId = metaPixelId?.trim() || null;

  useEffect(() => {
    captureMarketingAttribution();
    prepareMarketingDestinations({
      metaPixelId: normalizedMetaPixelId,
    });
  }, [normalizedMetaPixelId]);

  return normalizedMetaPixelId ? (
    <Script
      id="bric-meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="lazyOnload"
    />
  ) : null;
}
