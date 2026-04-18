'use client';

import * as Sentry from '@sentry/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { defaultLocale } from '@/i18n/config';
import { localizePathname } from '@/lib/seo';

function resolveLocale(pathname: string | null) {
  const maybeLocale = pathname?.split('/')[1] ?? '';
  return maybeLocale === 'fr' || maybeLocale === 'ar' ? maybeLocale : defaultLocale;
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
  const isArabic = locale === 'ar';

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={locale} dir={isArabic ? 'rtl' : 'ltr'}>
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            background:
              'linear-gradient(180deg, rgba(0,127,134,0.08) 0%, rgba(255,255,255,1) 35%, rgba(245,247,248,1) 100%)',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '46rem',
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '24px',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.08)',
              padding: '2.5rem',
              textAlign: 'center',
            }}
          >
            <Image
              src="/logo.png"
              alt="Bricomaitre"
              width={280}
              height={102}
              priority
              style={{ width: '100%', maxWidth: '280px', height: 'auto', margin: '0 auto 1.5rem' }}
            />
            <div
              style={{
                display: 'inline-block',
                marginBottom: '1rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '999px',
                background: 'rgba(249,115,22,0.12)',
                color: '#c2410c',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {isArabic ? 'خطأ' : 'Erreur'}
            </div>
            <h1
              style={{
                margin: 0,
                color: '#222222',
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                lineHeight: 1.05,
              }}
            >
              {isArabic ? 'حدث خطأ غير متوقع' : 'Une erreur inattendue est survenue'}
            </h1>
            <p
              style={{
                margin: '1rem auto 0',
                maxWidth: '34rem',
                color: '#4a4f55',
                fontSize: '1rem',
                lineHeight: 1.7,
              }}
            >
              {isArabic
                ? 'تعذر عرض هذه الصفحة بشكل كامل. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية أو متابعة تصفح المنتجات.'
                : "Cette page n'a pas pu se charger correctement. Vous pouvez reessayer, revenir a l'accueil ou continuer vers le catalogue."}
            </p>

            {error.digest ? (
              <div
                style={{
                  margin: '1.5rem auto 0',
                  maxWidth: '28rem',
                  borderRadius: '18px',
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: '#f8fafc',
                  padding: '0.9rem 1rem',
                  color: '#475569',
                  fontSize: '0.95rem',
                }}
              >
                <strong>{isArabic ? 'معرّف الخطأ:' : "Identifiant d'erreur:"}</strong> {error.digest}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0.75rem',
                marginTop: '2rem',
              }}
            >
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '12rem',
                  padding: '0.9rem 1.25rem',
                  borderRadius: '999px',
                  background: '#007f86',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {isArabic ? 'إعادة المحاولة' : 'Reessayer'}
              </button>
              <Link
                href={localizePathname('/', locale)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '12rem',
                  padding: '0.9rem 1.25rem',
                  borderRadius: '999px',
                  border: '1px solid rgba(0,127,134,0.2)',
                  color: '#007f86',
                  textDecoration: 'none',
                  fontWeight: 700,
                  background: '#ffffff',
                }}
              >
                {isArabic ? 'العودة إلى الرئيسية' : "Retour a l'accueil"}
              </Link>
              <Link
                href={localizePathname('/products', locale)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '12rem',
                  padding: '0.9rem 1.25rem',
                  borderRadius: '999px',
                  border: '1px solid rgba(0,127,134,0.2)',
                  color: '#007f86',
                  textDecoration: 'none',
                  fontWeight: 700,
                  background: '#ffffff',
                }}
              >
                {isArabic ? 'عرض المنتجات' : 'Voir le catalogue'}
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
