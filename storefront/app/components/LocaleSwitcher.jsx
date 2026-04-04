"use client";

import { useTransition } from "react";
import { useRouter as useBrowserRouter } from "next/navigation";

function LocaleButtons({ locale, onChange }) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm">
      <button
        className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-200 ${
          locale === "fr" ? "bg-teal-700 text-white" : "text-slate-600 hover:text-teal-700"
        }`}
        onClick={() => locale !== "fr" && onChange?.("fr")}
        type="button"
      >
        FR
      </button>
      <button
        className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-200 ${
          locale === "ar" ? "bg-teal-700 text-white" : "text-slate-600 hover:text-teal-700"
        }`}
        onClick={() => locale !== "ar" && onChange?.("ar")}
        type="button"
      >
        ع
      </button>
    </div>
  );
}

export function LocaleSwitcherFallback({ locale }) {
  return <LocaleButtons locale={locale} />;
}

export default function LocaleSwitcher({ locale, pathname }) {
  const browserRouter = useBrowserRouter();
  const [, startTransition] = useTransition();

  const onChange = (nextLocale) => {
    startTransition(() => {
      const query = typeof window !== "undefined" ? window.location.search.slice(1) : "";
      const localizedPath = pathname === "/" ? `/${nextLocale}` : `/${nextLocale}${pathname}`;
      const href = query ? `${localizedPath}?${query}` : localizedPath;
      browserRouter.replace(href);
    });
  };

  return <LocaleButtons locale={locale} onChange={onChange} />;
}
