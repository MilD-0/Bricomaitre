import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

import { defaultLocale } from "@/i18n/config";
import { localizePathname } from "@/lib/seo";

export default async function NotFound() {
  const locale = (await getLocale().catch(() => defaultLocale)) ?? defaultLocale;
  const isArabic = locale === "ar";
  const homeHref = localizePathname("/", locale);
  const productsHref = localizePathname("/products", locale);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background:
          "linear-gradient(180deg, rgba(0,127,134,0.08) 0%, rgba(255,255,255,1) 35%, rgba(245,247,248,1) 100%)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "42rem",
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.08)",
          padding: "2.5rem",
          textAlign: "center",
        }}
      >
        <Image
          src="/logo.png"
          alt="Bricomaitre"
          width={280}
          height={102}
          priority
          style={{ width: "100%", maxWidth: "280px", height: "auto", margin: "0 auto 1.5rem" }}
        />
        <div
          style={{
            display: "inline-block",
            marginBottom: "1rem",
            padding: "0.4rem 0.75rem",
            borderRadius: "999px",
            background: "rgba(0,127,134,0.1)",
            color: "#007f86",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          404
        </div>
        <h1
          style={{
            margin: 0,
            color: "#222222",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            lineHeight: 1.05,
          }}
        >
          {isArabic ? "الصفحة غير موجودة" : "Page introuvable"}
        </h1>
        <p
          style={{
            margin: "1rem auto 0",
            maxWidth: "32rem",
            color: "#4a4f55",
            fontSize: "1rem",
            lineHeight: 1.7,
          }}
        >
          {isArabic
            ? "الصفحة المطلوبة غير متوفرة أو تم نقلها. ارجع إلى الصفحة الرئيسية أو تابع تصفح المنتجات المتوفرة."
            : "La page demandee n'existe pas ou n'est plus disponible. Revenez a l'accueil ou explorez le catalogue pour continuer votre visite."}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.75rem",
            marginTop: "2rem",
          }}
        >
          <Link
            href={homeHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "12rem",
              padding: "0.9rem 1.25rem",
              borderRadius: "999px",
              background: "#007f86",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {isArabic ? "العودة إلى الرئيسية" : "Retour a l'accueil"}
          </Link>
          <Link
            href={productsHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "12rem",
              padding: "0.9rem 1.25rem",
              borderRadius: "999px",
              border: "1px solid rgba(0,127,134,0.2)",
              color: "#007f86",
              textDecoration: "none",
              fontWeight: 700,
              background: "#ffffff",
            }}
          >
            {isArabic ? "عرض المنتجات" : "Voir le catalogue"}
          </Link>
        </div>
      </section>
    </main>
  );
}
