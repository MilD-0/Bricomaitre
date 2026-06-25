import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageShell } from "@/components/page-shell";
import { RouteFoundation } from "@/components/route-foundation";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Bricomaitre checkout foundation.",
  robots: {
    index: false,
    follow: false
  }
};

export default async function CheckoutPage() {
  const t = await getTranslations("Checkout");

  return (
    <PageShell>
      <RouteFoundation
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        primaryLabel={t("primaryAction")}
        primaryHref="/thank-you"
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
