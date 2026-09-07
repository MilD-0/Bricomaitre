'use client';
import { AppShellView } from './shell/shell-view';
import { useAppShell } from './shell/use-shell';
export function AppShell(...args: Parameters<typeof useAppShell>) {
  const model = useAppShell(...args);
  if (model.view === null) return model.fallback;
  return <AppShellView {...model.view} />;
}
