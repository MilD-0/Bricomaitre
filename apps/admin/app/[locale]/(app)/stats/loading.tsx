import { Card } from '../../../../components/ui/card';
import { Skeleton } from '../../../../components/ui/skeleton';

export default function StatsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-[2rem] p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/60" />
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 rounded-xl" />
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-[1.75rem]" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[2rem] p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-[320px] rounded-[1.5rem]" />
          </div>
        </Card>
        <Card className="rounded-[2rem] p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-[320px] rounded-[1.5rem]" />
          </div>
        </Card>
      </div>

      <Card className="rounded-[2rem] p-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
        </div>
      </Card>
    </div>
  );
}
