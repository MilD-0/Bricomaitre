'use client';

import '@/app/styles/storefront-failure.css';

import type { Locale } from '@/i18n/config';

const copy = {
  fr: {
    errorEyebrow: 'Un imprévu est survenu',
    errorTitle: 'Cette page a rencontré un problème',
    errorDescription:
      'Vos informations restent intactes. Réessayez ou revenez à l’accueil pour continuer vos achats.',
    notFoundEyebrow: 'Page introuvable',
    notFoundTitle: 'Cette page n’existe plus',
    notFoundDescription:
      'Le lien est peut-être ancien ou incorrect. Retrouvez nos produits depuis l’accueil.',
    retry: 'Réessayer',
    home: 'Retour à l’accueil',
    catalog: 'Voir les produits',
  },
  ar: {
    errorEyebrow: 'حدث خطأ غير متوقع',
    errorTitle: 'تعذر عرض هذه الصفحة',
    errorDescription: 'معلوماتك محفوظة. حاول مرة أخرى أو عد إلى الصفحة الرئيسية لمتابعة التسوق.',
    notFoundEyebrow: 'الصفحة غير موجودة',
    notFoundTitle: 'هذه الصفحة لم تعد متاحة',
    notFoundDescription:
      'قد يكون الرابط قديماً أو غير صحيح. يمكنك متابعة تصفح المنتجات من الصفحة الرئيسية.',
    retry: 'حاول مرة أخرى',
    home: 'العودة إلى الرئيسية',
    catalog: 'عرض المنتجات',
  },
} as const;

export function StorefrontFailure({
  kind,
  locale,
  onRetry,
}: {
  kind: 'error' | 'not-found';
  locale: Locale;
  onRetry?: () => void;
}) {
  const text = copy[locale];
  const isError = kind === 'error';
  const titleId = `storefront-${kind}-title`;

  return (
    <main className="storefront-failure-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <section
        className="storefront-failure-card"
        aria-labelledby={titleId}
        {...(isError ? { role: 'alert' } : {})}
      >
        <a className="storefront-failure-brand" href={`/${locale}`} aria-label="Bricomaitre">
          BRICO<span>MAITRE</span>
        </a>
        <span className="storefront-failure-mark" aria-hidden="true">
          {isError ? '!' : '?'}
        </span>
        <p className="eyebrow">{isError ? text.errorEyebrow : text.notFoundEyebrow}</p>
        <h1 id={titleId}>{isError ? text.errorTitle : text.notFoundTitle}</h1>
        <p>{isError ? text.errorDescription : text.notFoundDescription}</p>
        <div className="storefront-failure-actions">
          {isError && onRetry ? (
            <button className="button button-primary" type="button" onClick={onRetry}>
              {text.retry}
            </button>
          ) : null}
          <a
            className={`button ${isError ? 'button-secondary' : 'button-primary'}`}
            href={`/${locale}`}
          >
            {text.home}
          </a>
          {!isError ? (
            <a className="button button-secondary" href={`/${locale}/products`}>
              {text.catalog}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
