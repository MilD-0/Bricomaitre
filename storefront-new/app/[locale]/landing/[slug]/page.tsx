import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";

type LandingPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { slug } = await params;

  return {
    title: `Landing ${slug}`,
    description: "Admin-created Bricomaitre landing page foundation."
  };
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { slug } = await params;
  const t = await getTranslations("Landing");

  return (
    <PageShell>
      <RouteFoundation
        eyebrow={t("eyebrow")}
        title={t("title", { slug })}
        description={t("description")}
        primaryLabel={t("primaryAction")}
        primaryHref="/checkout"
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
