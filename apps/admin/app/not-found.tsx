import { getLocale } from 'next-intl/server';

import { defaultLocale, isRtl } from '../lib/i18n';

const COPY = {
  en: {
    title: 'That admin page does not exist',
    description: 'Check the link or return to your workspace.',
    primary: 'Return to workspace',
    secondary: 'Go to products',
  },
  fr: {
    title: "Cette page d'administration n'existe pas",
    description: "Cette page a peut-être été déplacée. Vérifiez le lien ou revenez à l'accueil.",
    primary: "Revenir à l'accueil",
    secondary: 'Aller aux produits',
  },
  ar: {
    title: 'هذه الصفحة الإدارية غير موجودة',
    description: 'تحقق من الرابط أو ارجع إلى مساحة العمل.',
    primary: 'العودة إلى مساحة العمل',
    secondary: 'الذهاب إلى المنتجات',
  },
} as const;

export default async function NotFound() {
  const locale = ((await getLocale().catch(() => defaultLocale)) ??
    defaultLocale) as keyof typeof COPY;
  const copy = COPY[locale] ?? COPY.en;

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
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={`/${locale}`}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              >
                {copy.primary}
              </a>
              <a
                href={`/${locale}/products`}
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-medium hover:bg-accent"
              >
                {copy.secondary}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
