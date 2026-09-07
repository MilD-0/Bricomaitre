import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceToolbar,
} from '@/components/ui/workspace';

export default function OrdersLoading() {
  return (
    <WorkspaceFrame className="scroll-mt-24 overflow-hidden" data-workspace-loading="orders">
      <WorkspaceHeader>
        <Skeleton className="hidden h-9 w-36 lg:block" />
        <WorkspaceActions>
          <Skeleton className="h-10 w-32" />
        </WorkspaceActions>
      </WorkspaceHeader>
      <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/50 p-px sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="bg-background px-3 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>
      <WorkspaceToolbar className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-10 min-w-0 flex-1" />
        <Skeleton className="h-10 w-full sm:w-56" />
      </WorkspaceToolbar>

      <div className="hidden overflow-x-auto lg:block">
        <div className="grid grid-cols-[3rem_9rem_17rem_12rem_16rem_11rem_10rem_11rem_12rem_8rem] gap-4 border-y border-border/70 px-4 py-3 text-sm sm:px-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[3rem_9rem_17rem_12rem_16rem_11rem_10rem_11rem_12rem_8rem] gap-4 border-b border-border/60 px-4 py-4 sm:px-5"
            >
              {Array.from({ length: 10 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 lg:hidden">
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
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <Skeleton className="h-8 w-56" />
      </div>
    </WorkspaceFrame>
  );
}
