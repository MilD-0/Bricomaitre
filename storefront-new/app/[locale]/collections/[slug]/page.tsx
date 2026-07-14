import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from 'next/navigation';

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";
import { isLocale } from '@/i18n/config';

type CollectionPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;

  return {
    title: `Collection ${slug}`,
    description: "Bricomaitre collection page foundation."
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'Collection' });

  return (
    <PageShell locale={locale}>
      <RouteFoundation
        locale={locale}
        eyebrow={t("eyebrow")}
        title={t("title", { slug })}
        description={t("description")}
        primaryLabel={t("primaryAction")}
        primaryHref="/products"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {t("foundationKicker")}
        </p>
        <h2 className="mt-3 text-xl font-semibold">{t("foundationTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{t("foundationBody")}</p>
      </RouteFoundation>
    </PageShell>
  );
}
