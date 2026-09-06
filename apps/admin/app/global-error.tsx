'use client';

import './globals.css';

import * as Sentry from '@sentry/nextjs';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { defaultLocale, isRtl, locales, type Locale } from '../lib/i18n';

const COPY = {
  en: {
    title: 'The admin workspace hit an unexpected error',
    description: 'Try loading this page again or return to your workspace.',
    retry: 'Try again',
    dashboard: 'Return to workspace',
    products: 'Go to products',
    digest: 'Error digest',
  },
  fr: {
    title: "L'espace d'administration a rencontré une erreur inattendue",
    description: "Réessayez de charger cette page ou revenez à l'accueil.",
    retry: 'Réessayer',
    dashboard: "Revenir à l'accueil",
    products: 'Aller aux produits',
    digest: "Identifiant d'erreur",
  },
  ar: {
    title: 'حدث خطأ غير متوقع داخل لوحة الإدارة',
    description: 'أعد تحميل الصفحة أو ارجع إلى مساحة العمل.',
    retry: 'إعادة المحاولة',
    dashboard: 'العودة إلى مساحة العمل',
    products: 'الذهاب إلى المنتجات',
    digest: 'معرّف الخطأ',
  },
} as const;

function resolveLocale(pathname: string | null): Locale {
  const maybeLocale = pathname?.split('/')[1] ?? '';
  return locales.includes(maybeLocale as Locale) ? (maybeLocale as Locale) : defaultLocale;
}

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();
  const locale = resolveLocale(pathname);
  const copy = COPY[locale];

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <body>
        <main className="grid min-h-screen place-items-center bg-background px-4 py-12 text-foreground">
          <div className="mx-auto w-full max-w-xl text-center">
            <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground">
              {copy.description}
            </p>

            {error.digest ? (
              <div className="mt-6 border-y border-border py-3 text-start text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{copy.digest}:</span> {error.digest}
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              >
                {copy.retry}
              </button>
              <a
                href={`/${locale}`}
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-medium hover:bg-accent"
              >
                {copy.dashboard}
              </a>
              <a
                href={`/${locale}/products`}
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-medium hover:bg-accent"
              >
                {copy.products}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
