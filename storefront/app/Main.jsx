"use client";

import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import bg1 from "../public/mecha.webp";
import bg2 from "../public/intro.webp";
import { Link } from "@/i18n/navigation";
import Card from "./components/Card";
import FeaturedGroup from "./components/FeaturedGroup";
import Layout from "./components/layout";
import { HeroSkeleton } from "./components/ui";

function BannerCarousel({ banners, locale }) {
  const [emblaRef] = useEmblaCarousel({
    align: "start",
    direction: locale === "ar" ? "rtl" : "ltr",
    loop: banners.length > 1,
  });

  return (
    <section className="sf-container">
      <div className="embla__viewport sf-card overflow-hidden rounded-[1.75rem]" ref={emblaRef}>
        <div className="embla__container">
          {banners.map((banner, index) => (
            <div key={banner._id} className="embla__slide !flex-[0_0_100%]">
              <Link className="block" href={banner.link}>
                <Image
                  alt={(locale === "ar" ? (banner.titleAr || banner.title) : banner.title) || "featured"}
                  className="h-auto min-h-[220px] w-full rounded-[1.75rem] object-cover md:min-h-[420px]"
                  height={1600}
                  priority={index === 0}
                  quality={60}
                  sizes="(max-width: 768px) 100vw, 85vw"
                  src={banner.image}
                  width={2400}
                />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandCarousel({ brands, locale }) {
  const [emblaRef] = useEmblaCarousel({
    align: "start",
    direction: locale === "ar" ? "rtl" : "ltr",
    dragFree: true,
    loop: false,
  });

  return (
    <section className="sf-container embla" style={{ "--slide-spacing": "1rem" }}>
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container items-center">
          {brands.map((brand) => (
            <div
              key={brand._id}
              className="embla__slide !flex-[0_0_48%] md:!flex-[0_0_31%] lg:!flex-[0_0_23%]"
            >
              <Link
                className="sf-image-frame flex h-full min-h-[148px] items-center justify-center p-4 transition-transform duration-200 hover:-translate-y-1 md:p-6"
                href={`/brands/${brand.slug}`}
              >
                <Image
                  alt={brand.name || "brand"}
                  className="mx-auto h-[84px] w-auto object-contain md:h-[120px]"
                  height={240}
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                  src={brand.image}
                  width={240}
                />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home({
  initialHomepageData = { banners: [], featuredGroups: [], cards: [], brands: [] },
}) {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [homepageData, setHomepageData] = useState(initialHomepageData);

  useEffect(() => {
    const hasInitialData = [
      initialHomepageData.banners?.length,
      initialHomepageData.featuredGroups?.length,
      initialHomepageData.cards?.length,
      initialHomepageData.brands?.length,
    ].some(Boolean);

    if (hasInitialData) {
      return;
    }

    let active = true;

    const loadHomepageData = async () => {
      try {
        const response = await fetch("/api/homepage");

        if (!response.ok) {
          throw new Error("Failed to load homepage data");
        }

        const data = await response.json();

        if (active) {
          setHomepageData(data);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void loadHomepageData();

    return () => {
      active = false;
    };
  }, [initialHomepageData]);

  const banners = homepageData.banners ?? [];
  const featuredGroups = homepageData.featuredGroups ?? [];
  const cards = homepageData.cards ?? [];
  const brands = homepageData.brands ?? [];

  return (
    <main>
      <Layout>
        <div className="space-y-10 pb-8 md:space-y-14 md:pb-16">
          <div className="overflow-hidden pt-2">
            {banners.length > 0 ? (
              <BannerCarousel key={locale} banners={banners} locale={locale} />
            ) : (
              <HeroSkeleton />
            )}
          </div>

          <section className="sf-container text-center">
            <h1 className="sf-title">{t("maga-cat")}</h1>
          </section>

          <div className="sf-container grid gap-4 md:grid-cols-2 md:gap-6">
            <Link href="/products" className="block w-full">
              <div
                className="group relative min-h-[220px] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-cover bg-center bg-no-repeat p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 md:min-h-[320px]"
                style={{ backgroundImage: `url(${bg1.src})` }}
              >
                <div className="absolute inset-0 bg-[rgba(15,23,42,0.38)]" />
                <section className="relative z-10 flex h-full flex-col justify-end">
                  <h2 className="mt-2 text-2xl font-semibold uppercase text-white md:text-3xl">
                    {t("maga-mec")}
                  </h2>
                  <section className="mt-5 flex items-center gap-4">
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-900">
                      {t("maga")}
                    </span>
                  </section>
                </section>
              </div>
            </Link>

            <Link href="/products" className="block w-full">
              <div
                className="group relative min-h-[220px] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-cover bg-center bg-no-repeat p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 md:min-h-[320px]"
                style={{ backgroundImage: `url(${bg2.src})` }}
              >
                <div className="absolute inset-0 bg-[rgba(15,23,42,0.34)]" />
                <section className="relative z-10 flex h-full flex-col justify-end">
                  <h2 className="mt-2 w-full text-2xl font-semibold uppercase text-white md:text-3xl">
                    {t("maga-elec")}
                  </h2>
                  <section className="mt-5 flex items-center gap-4">
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-900">
                      {t("maga")}
                    </span>
                  </section>
                </section>
              </div>
            </Link>
          </div>

          {featuredGroups.length > 0 &&
            featuredGroups.map((group) => (
              <FeaturedGroup
                key={group._id}
                groupId={group.id}
                title={locale === "ar" ? (group.titleAr || group.title) : group.title}
                cta={group.cta}
                ctaAr={group.ctaAr}
                link={group.link}
                locale={locale}
              />
            ))}

          <section className="sf-container text-center">
            <h2 className="sf-title">{t("feature")}</h2>
          </section>
          {cards.length > 0 && (
            <div className="sf-container grid justify-items-center gap-4 md:grid-cols-2 md:gap-6">
              {cards.map((product) => (
                <Card key={product._id} id={product._id} productData={product} />
              ))}
            </div>
          )}

          <section className="sf-container text-center">
            <h2 className="sf-title">{t("maga-bra")}</h2>
          </section>
          <div className="pb-6">
            {brands.length > 0 ? <BrandCarousel brands={brands} locale={locale} /> : null}
          </div>
        </div>
      </Layout>
    </main>
  );
}
