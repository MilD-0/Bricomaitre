import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceNavigation,
} from '@/components/ui/workspace';

export default function AssetsLoading() {
  return (
    <WorkspaceFrame className="overflow-hidden" data-workspace-loading="assets">
      <WorkspaceHeader>
        <Skeleton className="hidden h-9 w-32 lg:block" />
        <WorkspaceActions>
          <Skeleton className="h-10 w-28" />
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceNavigation aria-label="Loading asset views">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28 shrink-0" />
        ))}
      </WorkspaceNavigation>
      <div className="divide-y divide-border/60 border-b border-border/60">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-4 lg:px-5"
          >
            <Skeleton className="size-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </WorkspaceFrame>
  );
}
