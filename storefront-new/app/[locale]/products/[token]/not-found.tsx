import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { PageShell } from '@/components/page-shell';
import { isLocale } from '@/i18n/config';

async function ProductNotFoundContent() {
  const t = await getTranslations('ProductDetail');
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : 'fr';
  return (
    <PageShell locale={locale}>
      <section className="product-state" aria-labelledby="product-not-found-title">
        <span className="product-state-icon" aria-hidden="true">?</span>
        <p className="eyebrow">{t('notFoundEyebrow')}</p>
        <h1 id="product-not-found-title">{t('notFoundTitle')}</h1>
        <p>{t('notFoundDescription')}</p>
        <a href={`/${locale}/products`} className="button button-primary">{t('backToProducts')}</a>
      </section>
    </PageShell>
  );
}

export default function ProductNotFound() {
  return (
    <Suspense fallback={<div className="product-state" aria-busy="true" />}>
      <ProductNotFoundContent />
    </Suspense>
  );
}
