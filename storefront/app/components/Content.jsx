import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import logo from "../../public/logo.png";

function ExternalArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  );
}

export default function Content() {
  const t = useTranslations("Layout");

  return (
    <footer className="border-t border-slate-200 bg-[#eef1ed]">
      <div className="sf-container grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <section className="order-2 text-center lg:order-1 lg:max-w-[16rem] lg:justify-self-end lg:text-start">
            <p className="sf-kicker">{t("parc")}</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-700 md:text-base">
              <Link href="/" className="hover:text-teal-700">{t("acc")}</Link>
              <Link href="/products" className="hover:text-teal-700">{t("prods")}</Link>
              <Link href="/cart" className="hover:text-teal-700">{t("cart")}</Link>
              <Link href="/contact" className="hover:text-teal-700">{t("con")}</Link>
            </div>
        </section>

        <div className="order-1 flex max-w-sm flex-col items-center gap-4 text-center lg:order-2 lg:justify-self-center lg:px-4">
          <Image
            src={logo}
            alt="Bricomaitre logo"
            width={logo.width}
            height={logo.height}
            className="h-auto w-[180px] md:w-[220px]"
            sizes="(max-width: 768px) 180px, 220px"
          />
          <p className="max-w-sm text-sm text-slate-600">
            Bricomaitre
            {" "}
            <span className="text-slate-500">outillage, bricolage et equipement pour l’atelier et la maison.</span>
          </p>
        </div>

        <section className="order-3 text-center lg:max-w-[16rem] lg:justify-self-start lg:text-start">
            <p className="sf-kicker">{t("dispo")}</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-700 md:text-base">
              <Link
                target="_blank"
                className="inline-flex items-center justify-center gap-2 hover:text-teal-700 lg:justify-start"
                href="https://www.facebook.com/profile.php?id=61562272954715"
              >
                Facebook
                <ExternalArrow />
              </Link>
              <p>{t("tel")}: 0778 81 03 60</p>
              <p>bricomaitre@gmail.com</p>
              <Link
                className="mx-auto inline-flex max-w-sm items-start gap-2 hover:text-teal-700 lg:mx-0"
                href="https://maps.app.goo.gl/MpAM58nHS2G5JBah8"
              >
                <span>BT N20, CITE 08 MAI 45, Bab Ezzouar 16024, Alger</span>
                <ExternalArrow />
              </Link>
            </div>
        </section>
      </div>
    </footer>
  );
}
