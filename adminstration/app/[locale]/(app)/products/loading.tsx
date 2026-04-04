import { Card } from '../../../../components/ui/card';
import { Skeleton } from '../../../../components/ui/skeleton';

export default function ProductsLoading() {
  return (
    <section className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-36" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-9 w-full max-w-sm" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="grid grid-cols-[3rem_7rem_minmax(14rem,1fr)_9rem_9rem_7rem_11rem_11rem_10rem] gap-4 border-y border-border/70 px-4 py-3 text-sm sm:px-5">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-[3rem_7rem_minmax(14rem,1fr)_9rem_9rem_7rem_11rem_11rem_10rem] gap-4 border-b border-border/60 px-4 py-4 sm:px-5">
              {Array.from({ length: 9 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-5 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border border-border/70 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-1 size-4" />
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="size-14 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </section>
  );
}
