export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`sf-skeleton ${className}`.trim()} />;
}

export function ProductCardSkeleton() {
  return (
    <article className="sf-card h-full overflow-hidden p-3 md:p-4">
      <Skeleton className="aspect-[4/4.2] w-full rounded-[1.25rem]" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 10 }) {
  return (
    <div className="sf-container grid grid-cols-2 gap-3 py-6 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="sf-container">
      <Skeleton className="h-[220px] w-full rounded-[1.75rem] md:h-[420px]" />
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="sf-container grid gap-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="sf-card overflow-hidden p-4 md:p-6">
        <Skeleton className="aspect-square w-full rounded-[1.5rem]" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-12 flex-1 rounded-full" />
          <Skeleton className="h-12 flex-1 rounded-full" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-14 w-40 rounded-[1rem]" />
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-24" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  );
}
