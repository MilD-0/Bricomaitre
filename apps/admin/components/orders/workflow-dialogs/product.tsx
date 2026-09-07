'use client';
import { Package } from 'lucide-react';

export function formatMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function OperationalThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly.
    <img src={src} alt={alt} className="size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
      <Package className="size-4" aria-hidden="true" />
    </span>
  );
}
