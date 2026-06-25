import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;

  return {
    title: `Collection ${slug}`,
    description: "Bricomaitre collection page foundation."
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const t = await getTranslations("Collection");

  return (
    <PageShell>
      <RouteFoundation
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
