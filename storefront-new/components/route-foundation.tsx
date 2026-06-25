import { Link } from "@/i18n/navigation";

type RouteFoundationProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  children?: React.ReactNode;
};

export function RouteFoundation({
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  children
}: RouteFoundationProps) {
  return (
    <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">{description}</p>
        {(primaryLabel && primaryHref) || (secondaryLabel && secondaryHref) ? (
          <div className="flex flex-wrap gap-3">
            {primaryLabel && primaryHref ? (
              <Link className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-vapor" href={primaryHref}>
                {primaryLabel}
              </Link>
            ) : null}
            {secondaryLabel && secondaryHref ? (
              <Link className="rounded-xl bg-secondary px-5 py-3 text-sm font-semibold text-primary" href={secondaryHref}>
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="rounded-2xl border border-border bg-card p-5 shadow-vapor">
        {children}
      </aside>
    </section>
  );
}
