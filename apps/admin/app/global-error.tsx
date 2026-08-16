'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { defaultLocale, isRtl, locales, type Locale } from '../lib/i18n';

const COPY = {
  en: {
    badge: 'System Error',
    title: 'The admin workspace hit an unexpected error',
    description:
      'The request failed before the page could finish rendering. You can retry this view or return to a stable section of the admin app.',
    retry: 'Try again',
    dashboard: 'Open dashboard',
    products: 'Go to products',
    digest: 'Error digest',
  },
  fr: {
    badge: 'Erreur système',
    title: "L'espace d'administration a rencontré une erreur inattendue",
    description:
      "La requête a échoué avant la fin du rendu. Vous pouvez réessayer cette vue ou revenir vers une section stable de l'application.",
    retry: 'Réessayer',
    dashboard: 'Ouvrir le tableau de bord',
    products: 'Aller aux produits',
    digest: "Identifiant d'erreur",
  },
  ar: {
    badge: 'خطأ بالنظام',
    title: 'حدث خطأ غير متوقع داخل لوحة الإدارة',
    description:
      'فشل الطلب قبل اكتمال عرض الصفحة. يمكنك إعادة المحاولة أو الرجوع إلى قسم مستقر داخل تطبيق الإدارة.',
    retry: 'إعادة المحاولة',
    dashboard: 'فتح لوحة الإدارة',
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
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_36%,#111827_100%)] px-4 py-8 text-foreground">
          <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
            <section className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl md:p-10">
              <div className="mx-auto max-w-3xl text-center">
                <div className="inline-flex rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                  {copy.badge}
                </div>
                <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                  {copy.title}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-7 text-slate-300 md:text-base">
                  {copy.description}
                </p>

                {error.digest ? (
                  <div className="mx-auto mt-6 max-w-xl rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-300">
                    <span className="font-semibold text-slate-100">{copy.digest}:</span>{' '}
                    {error.digest}
                  </div>
                ) : null}

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="inline-flex min-w-52 items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-vapor)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    {copy.retry}
                  </button>
                  <Link
                    href={`/${locale}/administration`}
                    className="inline-flex min-w-52 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors duration-200 hover:bg-white/10"
                  >
                    {copy.dashboard}
                  </Link>
                  <Link
                    href={`/${locale}/products`}
                    className="inline-flex min-w-52 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors duration-200 hover:bg-white/10"
                  >
                    {copy.products}
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}
