import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";

type ProductPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { token } = await params;

  return {
    title: `Product ${token}`,
    description: "Bricomaitre product detail foundation."
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { token } = await params;
  const t = await getTranslations("ProductDetail");

  return (
    <PageShell>
      <RouteFoundation
        eyebrow={t("eyebrow")}
        title={t("title", { token })}
        description={t("description")}
        primaryLabel={t("primaryAction")}
        primaryHref="/checkout"
        secondaryLabel={t("secondaryAction")}
        secondaryHref="/products"
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
