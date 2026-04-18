import Link from 'next/link';
import { getLocale } from 'next-intl/server';

import { defaultLocale } from '../lib/i18n';

const COPY = {
  en: {
    badge: 'Not Found',
    title: 'That admin page does not exist',
    description:
      'The page may have moved, the route may be wrong, or your current role should use a different entry point.',
    primary: 'Open dashboard',
    secondary: 'Go to products',
  },
  fr: {
    badge: 'Introuvable',
    title: "Cette page d'administration n'existe pas",
    description:
      "La page a peut-etre change d'emplacement, l'URL est incorrecte ou votre role doit passer par une autre section.",
    primary: 'Ouvrir le tableau de bord',
    secondary: 'Aller aux produits',
  },
  ar: {
    badge: 'غير موجود',
    title: 'هذه الصفحة الإدارية غير موجودة',
    description:
      'قد يكون المسار تغيّر، أو الرابط غير صحيح، أو أن دورك يجب أن يستخدم نقطة دخول أخرى داخل المنصة.',
    primary: 'فتح لوحة الإدارة',
    secondary: 'الذهاب إلى المنتجات',
  },
} as const;

export default async function NotFound() {
  const locale = ((await getLocale().catch(() => defaultLocale)) ?? defaultLocale) as keyof typeof COPY;
  const copy = COPY[locale] ?? COPY.en;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_36%,#111827_100%)] px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl md:p-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex rounded-full border border-sky-400/25 bg-sky-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
              {copy.badge}
            </div>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              {copy.title}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-7 text-slate-300 md:text-base">
              {copy.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/${locale}/administration`}
                className="inline-flex min-w-52 items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-vapor)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                {copy.primary}
              </Link>
              <Link
                href={`/${locale}/products`}
                className="inline-flex min-w-52 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors duration-200 hover:bg-white/10"
              >
                {copy.secondary}
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">01</p>
              <p className="mt-2 text-sm font-medium text-slate-100">Navigation guardrails</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Use the sidebar sections that match your role and environment permissions.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">02</p>
              <p className="mt-2 text-sm font-medium text-slate-100">Direct recovery</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Jump back into catalog or dashboard flows without losing context.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">03</p>
              <p className="mt-2 text-sm font-medium text-slate-100">Internal-only surface</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Metadata is locked to no-index defaults so the admin app stays out of search results.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
