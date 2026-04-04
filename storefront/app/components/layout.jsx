"use client";

import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname as useBrowserPathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { defaultLocale, isLocale } from "@/i18n/config";
import Logo from "./logo";
import LocaleSwitcher, { LocaleSwitcherFallback } from "./LocaleSwitcher";
import Footer from "./Footer";
import HeaderSearch from "./HeaderSearch";
import PhoneBadge from "./PhoneBadge";
import Search from "./search";
import { handlePageView } from "./Init";
import { CartContext } from "./cartContext";

function NavIcon({ children, href, active, badge = 0 }) {
  return (
    <Link
      href={href}
      className={`relative flex items-center justify-center rounded-full p-3 transition-colors duration-200 ${
        active ? "bg-teal-700 text-white shadow-lg shadow-teal-900/15" : "text-slate-500 hover:bg-white hover:text-teal-700"
      }`}
    >
      {children}
      {badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function Layout({ children }) {
  const browserPathname = useBrowserPathname();
  const t = useTranslations("Layout");
  const { cartProducts } = useContext(CartContext);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const lastToggleYRef = useRef(0);

  const locale = useMemo(() => {
    const maybeLocale = browserPathname?.split("/")[1] ?? "";
    return isLocale(maybeLocale) ? maybeLocale : defaultLocale;
  }, [browserPathname]);

  const pathname = useMemo(() => {
    if (!browserPathname) {
      return "/";
    }

    const [, maybeLocale, ...rest] = browserPathname.split("/");
    if (!isLocale(maybeLocale)) {
      return browserPathname;
    }

    return rest.length > 0 ? `/${rest.join("/")}` : "/";
  }, [browserPathname]);

  useEffect(() => {
    handlePageView();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    lastScrollYRef.current = window.scrollY;
    lastToggleYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollYRef.current;

      if (currentScrollY <= 64) {
        setIsHeaderVisible(true);
        lastToggleYRef.current = currentScrollY;
        lastScrollYRef.current = currentScrollY;
        return;
      }

      if (delta > 0 && currentScrollY - lastToggleYRef.current > 36) {
        setIsHeaderVisible(false);
        lastToggleYRef.current = currentScrollY;
      } else if (delta < 0 && lastToggleYRef.current - currentScrollY > 20) {
        setIsHeaderVisible(true);
        lastToggleYRef.current = currentScrollY;
      }

      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const headerTone = pathname.includes("/cart") ? "bg-white/95" : "bg-[rgba(255,255,255,0.82)]";
  const activeLink = "text-slate-950";
  const inactiveLink = "text-slate-500 hover:text-teal-700";
  const navItems = useMemo(
    () => [
      { href: "/", label: t("acc"), active: pathname === "/" },
      { href: "/products", label: t("prods"), active: pathname.includes("/products") },
      { href: "/contact", label: t("con"), active: pathname.includes("/contact") },
      { href: "/cart", label: t("cart"), active: pathname.includes("/cart"), badge: cartProducts.length },
    ],
    [cartProducts.length, pathname, t],
  );

  return (
    <div className="min-h-screen text-slate-800">
      <div
        className={`sticky top-0 z-50 px-2 pt-1 transition-transform duration-300 ease-out md:px-3 md:pt-1 ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-[calc(100%+0.75rem)]"
        }`}
      >
        <header className={`sf-surface overflow-visible rounded-[1.75rem] ${headerTone}`}>
          <div className="sf-container py-2.5 md:py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Logo />
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <PhoneBadge />
                <Suspense fallback={<LocaleSwitcherFallback locale={locale} />}>
                  <LocaleSwitcher locale={locale} pathname={pathname} />
                </Suspense>
              </div>
            </div>

            <div className="mt-2.5 md:mt-2">
              {pathname === "/products" ? (
                <Suspense>
                  <Search setResults={setResults} />
                </Suspense>
              ) : (
                <HeaderSearch setResults={setResults} setIsSearching={setIsSearching} />
              )}
            </div>

            <div className="relative">
              {pathname !== "/products" && (isSearching || results.length > 0) ? (
                <div className="sf-dropdown-enter absolute left-0 right-0 top-3 z-50 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
                  {results.length > 0 ? (
                    results.map((product, index) => (
                      <Link
                        key={product._id}
                        href={`/products/${product.slug}`}
                        className="sf-dropdown-item-enter flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors duration-150 hover:bg-slate-50 last:border-b-0"
                        style={{ animationDelay: `${index * 35}ms` }}
                      >
                        <Image
                          src={product.images[0]}
                          alt="product image"
                          width={72}
                          height={72}
                          className="h-[72px] w-[72px] rounded-2xl border border-slate-100 object-contain"
                          sizes="72px"
                        />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.title}</p>
                          <p className="mt-1 text-sm font-bold text-teal-700">
                            {product.price}
                            {t("da")}
                          </p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="sf-dropdown-item-enter px-4 py-4">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <nav className="mt-2.5 hidden items-center justify-between gap-3 text-sm font-semibold md:mt-2 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-1.5 text-center transition-colors duration-200 ${
                    item.active ? "bg-white text-slate-950 shadow-sm" : inactiveLink
                  }`}
                >
                  <span className={item.active ? activeLink : ""}>{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">{item.badge}</span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
        </header>
      </div>

      <main className="pb-28 pt-4 md:pb-12">{children}</main>

      {!pathname.includes("/products/") && !pathname.includes("/landing/") ? <Footer /> : null}

      {!pathname.includes("/products/") && !pathname.includes("/landing/") ? (
        <div className="fixed inset-x-3 bottom-3 z-50 md:hidden">
          <nav className="sf-surface flex items-center justify-around rounded-[1.75rem] px-3 py-2">
            <NavIcon href="/products" active={pathname.includes("/products")}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
            </NavIcon>
            <NavIcon href="/" active={pathname === "/"}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </NavIcon>
            <NavIcon href="/cart" active={pathname.includes("/cart")} badge={cartProducts.length}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
            </NavIcon>
          </nav>
        </div>
      ) : null}

    </div>
  );
}
