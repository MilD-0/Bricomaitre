'use client';

import { useEffect } from 'react';

import type { Locale } from '@/i18n/config';
import { trackProductEvent } from '@/lib/analytics';

export function LandingPageTelemetry({ locale, landingPageId, revision, productId, productSlug }: { locale: Locale; landingPageId: number; revision: number; productId: number; productSlug: string }) {
  useEffect(() => {
    void trackProductEvent({
      eventName: 'view_item', locale, productId, productSlug,
      categoryId: null, categorySlug: null, brandId: null, brandSlug: null,
      metadata: { landingPageId, landingRevision: revision },
    });
  }, [landingPageId, locale, productId, productSlug, revision]);
  return null;
}
