'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';

import { captureMarketingAttribution } from '@/lib/marketing-attribution';
import { prepareMarketingDestinations } from '@/lib/marketing-destinations';

type MarketingPixelsProps = {
  metaPixelId: string | null;
  googleMeasurementId: string | null;
};

export function MarketingPixels({ metaPixelId, googleMeasurementId }: MarketingPixelsProps) {
  const normalizedMetaPixelId = metaPixelId?.trim() || null;
  const normalizedGoogleMeasurementId = googleMeasurementId?.trim() || null;
  const [metaSettled, setMetaSettled] = useState(!normalizedMetaPixelId);

  useEffect(() => {
    captureMarketingAttribution();
    prepareMarketingDestinations({
      metaPixelId: normalizedMetaPixelId,
      googleMeasurementId: normalizedGoogleMeasurementId,
    });
  }, [normalizedGoogleMeasurementId, normalizedMetaPixelId]);

  return (
    <>
      {normalizedMetaPixelId ? (
        <Script
          id="bric-meta-pixel"
          src="https://connect.facebook.net/en_US/fbevents.js"
          strategy="lazyOnload"
          onLoad={() => setMetaSettled(true)}
          onError={() => setMetaSettled(true)}
        />
      ) : null}
      {normalizedGoogleMeasurementId && metaSettled ? (
        <Script
          id="bric-google-analytics"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(normalizedGoogleMeasurementId)}`}
          strategy="lazyOnload"
        />
      ) : null}
    </>
  );
}
