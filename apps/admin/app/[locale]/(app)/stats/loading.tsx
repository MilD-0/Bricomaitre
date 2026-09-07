import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceToolbar,
} from '@/components/ui/workspace';

export default function StatsLoading() {
  return (
    <WorkspaceFrame className="overflow-hidden" data-workspace-loading="stats">
      <WorkspaceHeader>
        <div className="hidden space-y-2 lg:block">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <WorkspaceActions>
          <Skeleton className="h-8 w-24" />
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceToolbar className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="ms-auto h-10 w-32" />
      </WorkspaceToolbar>
      <div className="grid grid-cols-2 border-b border-border/60 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="border-e border-border/50 px-4 py-5 last:border-e-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-32 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-0 xl:grid-cols-2">
        <div className="border-b border-border/60 p-5 xl:border-e">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-4 h-[320px] w-full" />
        </div>
        <div className="border-b border-border/60 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-[320px] w-full" />
        </div>
      </div>
    </WorkspaceFrame>
  );
}
