import { Skeleton } from '../../../../components/ui/skeleton';

export default function LandingPagesLoading() {
  return (
    <main className="space-y-6" aria-label="Chargement des landing pages">
      <header className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </header>
      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
        <div className="flex gap-3 border-b border-border/70 p-5">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-[1.75rem]" />
        <Skeleton className="h-[36rem] rounded-[1.75rem]" />
      </div>
    </main>
  );
}
