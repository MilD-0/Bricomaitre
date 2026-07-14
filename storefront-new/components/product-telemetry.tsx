'use client';

import { useEffect, useRef } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

import type { Locale } from '@/i18n/config';
import { trackProductEvent } from '@/lib/analytics';

type ProductTelemetryProps = {
  locale: Locale;
  productId: number;
  productSlug: string;
  categoryId: number | null;
  categorySlug: string | null;
  brandId: number | null;
  brandSlug: string | null;
  value: number;
};

export function ProductTelemetry(props: ProductTelemetryProps) {
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void trackProductEvent({ eventName: 'view_item', ...props });
  }, [props]);

  useReportWebVitals((metric) => {
    if (!['LCP', 'INP', 'CLS'].includes(metric.name)) return;
    void trackProductEvent({
      eventName: 'web_vital',
      ...props,
      metadata: {
        metricId: metric.id,
        metricName: metric.name,
        metricValue: metric.value,
        metricRating: metric.rating,
        navigationType: metric.navigationType,
      },
    });
  });

  return null;
}
