import { Card } from '../../../../components/ui/card';
import { Skeleton } from '../../../../components/ui/skeleton';

function AssetsSectionSkeleton() {
  return (
    <section className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <div className="grid grid-cols-[5rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_10rem] gap-4 border-y border-border/70 px-4 py-3 sm:px-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[5rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_10rem] gap-4 border-b border-border/60 px-4 py-4 sm:px-5"
            >
              {Array.from({ length: 6 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 px-4 pb-4 lg:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border border-border/70 p-4">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function AssetsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <AssetsSectionSkeleton />
      <AssetsSectionSkeleton />
      <AssetsSectionSkeleton />
    </div>
  );
}
