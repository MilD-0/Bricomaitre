import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

import { defaultLocale } from "@/i18n/config";
import {
  buildLandingProductHref,
  fetchLegacyProductsPage,
} from "@/lib/storefront-api";
import { localizePathname } from "@/lib/seo";

export default async function ProductNotFound() {
  const locale = (await getLocale().catch(() => defaultLocale)) ?? defaultLocale;
  const isArabic = locale === "ar";
  const recommendations = await fetchLegacyProductsPage({
    limit: 8,
    instock: true,
  });
  const products = recommendations.products.filter((product) => product.images?.[0]).slice(0, 8);

  return (
    <section className="sf-container pb-12 pt-4">
      <div className="sf-card overflow-hidden border border-slate-200 bg-[linear-gradient(135deg,rgba(0,127,134,0.1)_0%,rgba(255,255,255,1)_50%,rgba(248,250,252,1)_100%)] p-6 md:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex rounded-full bg-teal-50 px-4 py-1.5 text-sm font-bold uppercase tracking-[0.18em] text-teal-700">
            404
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            {isArabic ? "هذا المنتج لم يعد متوفرا" : "Ce produit n'est plus disponible"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
            {isArabic
              ? "لم نعثر على هذا المنتج في قاعدة البيانات الحالية. اختر منتجا قريبا من التشكيلة المتوفرة حتى لا تنقطع رحلة الشراء."
              : "Nous n'avons pas trouve ce produit dans le catalogue actuel. Voici d'autres articles disponibles pour poursuivre votre visite sans quitter la boutique."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={localizePathname("/products", locale)}
              className="sf-button-accent px-6 py-3"
            >
              {isArabic ? "تصفح كل المنتجات" : "Parcourir les produits"}
            </Link>
            <Link
              href={localizePathname("/", locale)}
              className="sf-button-secondary px-6 py-3"
            >
              {isArabic ? "العودة إلى الرئيسية" : "Retour a l'accueil"}
            </Link>
          </div>
        </div>
      </div>

      {products.length > 0 ? (
        <div className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                {isArabic ? "اقتراحات" : "Suggestions"}
              </p>
              <h2 className="sf-title mt-2 text-3xl">
                {isArabic ? "منتجات متوفرة الآن" : "Produits disponibles maintenant"}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {products.map((product) => (
              <article key={product._id} className="sf-card overflow-hidden p-3">
                <Link
                  href={localizePathname(buildLandingProductHref(product), locale)}
                  className="sf-image-frame flex h-[13rem] items-center justify-center p-3 lg:h-[15rem]"
                >
                  <Image
                    src={product.images[0]}
                    width={320}
                    height={320}
                    alt={isArabic && product.title_ar?.length > 2 ? product.title_ar : product.title}
                    className="h-full w-full object-contain transition duration-300 hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                </Link>

                <Link
                  href={localizePathname(buildLandingProductHref(product), locale)}
                  className="block"
                >
                  <h3 className="mt-4 line-clamp-2 text-sm font-semibold text-slate-900 transition-colors duration-300 hover:text-teal-700 lg:text-base">
                    {isArabic && product.title_ar?.length > 2 ? product.title_ar : product.title}
                  </h3>
                </Link>

                {product.OldPrice ? (
                  <span className="mt-2 block text-sm font-medium text-orange-600 line-through">
                    {product.OldPrice}
                    {isArabic ? " دج" : " DA"}
                  </span>
                ) : null}

                <span className="mt-1 block text-base font-bold text-teal-700 lg:text-lg">
                  {product.price}
                  {isArabic ? " دج" : " DA"}
                </span>

                <p className="mt-2 line-clamp-3 text-xs leading-6 text-slate-600 lg:text-sm">
                  {isArabic && product.summary_ar?.length > 2 ? product.summary_ar : product.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
