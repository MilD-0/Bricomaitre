import type { QueryClient } from '@tanstack/react-query';

export type QuerySnapshot<T> = Array<[readonly unknown[], T | undefined]>;

export function captureQueries<T>(queryClient: QueryClient, queryKey: readonly unknown[]) {
  return queryClient.getQueriesData<T>({ queryKey }) as QuerySnapshot<T>;
}

export function restoreQueries<T>(queryClient: QueryClient, snapshot: QuerySnapshot<T>) {
  snapshot.forEach(([key, value]) => {
    queryClient.setQueryData(key, value);
  });
}
