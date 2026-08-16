'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import type { Locale } from '@/i18n/config';
import { trackPageView } from '@/lib/analytics';

export function PageViewTelemetry({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || previous.current === pathname) return;
    previous.current = pathname;
    void trackPageView({
      locale,
      pageType: pathname.includes('/checkout')
        ? 'checkout'
        : pathname.includes('/thank-you')
          ? 'thank_you'
          : pathname.includes('/landing/')
            ? 'landing'
            : pathname.includes('/products/')
              ? 'product_detail'
              : pathname.endsWith('/products')
                ? 'catalog'
                : 'homepage',
    });
  }, [locale, pathname]);
  return null;
}
