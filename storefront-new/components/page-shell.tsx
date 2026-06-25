import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

type PageShellProps = {
  children: React.ReactNode;
};

export async function PageShell({ children }: PageShellProps) {
  const t = await getTranslations("Navigation");

  const links = [
    { href: "/", label: t("home") },
    { href: "/products", label: t("products") },
    { href: "/collections/featured", label: t("collections") },
    { href: "/landing/example", label: t("landing") },
    { href: "/checkout", label: t("checkout") }
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Bricomaitre
            </span>
            <span className="mt-1 text-xl font-semibold tracking-tight">{t("storefront")}</span>
          </Link>
          <nav aria-label={t("label")} className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                className="rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-primary"
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
