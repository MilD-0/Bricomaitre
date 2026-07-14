import { getTranslations } from "next-intl/server";
import { notFound } from 'next/navigation';

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";
import { isLocale } from '@/i18n/config';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <PageShell locale={locale}>
      <RouteFoundation
        locale={locale}
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("intro")}
        primaryLabel={t("primaryAction")}
        primaryHref="/products"
        secondaryLabel={t("checkoutAction")}
        secondaryHref="/checkout"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {t("statusKicker")}
        </p>
        <h2 className="mt-3 text-xl font-semibold">{t("statusTitle")}</h2>
        <dl className="mt-5 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3">
            <dt className="font-medium text-muted">{t("apiStatusLabel")}</dt>
            <dd className="font-semibold text-primary">{t("apiStatusValue")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3">
            <dt className="font-medium text-muted">{t("localeLabel")}</dt>
            <dd className="font-semibold text-primary">{t("localeValue")}</dd>
          </div>
        </dl>
      </RouteFoundation>
    </PageShell>
  );
}
