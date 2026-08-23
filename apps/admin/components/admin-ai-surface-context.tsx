'use client';

import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';

import {
  adminAiSurfaceContextSchema,
  resolveAdminAiSurfaceContext,
  type AdminAiSurfaceContext,
  type AdminAiSurfaceDetails,
} from '../lib/admin-ai-context';

const defaultContext = resolveAdminAiSurfaceContext('/en');
const AdminAiSurfaceContext = createContext<{
  context: AdminAiSurfaceContext;
  register: (id: string, details: AdminAiSurfaceDetails | null) => void;
}>({ context: defaultContext, register: () => {} });

export function AdminAiSurfaceProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const [hash, setHash] = useState('');
  const [registrations, setRegistrations] = useState(
    () => new Map<string, AdminAiSurfaceDetails>(),
  );

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const register = useCallback((id: string, details: AdminAiSurfaceDetails | null) => {
    setRegistrations((current) => {
      const next = new Map(current);
      if (details) next.set(id, details);
      else next.delete(id);
      return next;
    });
  }, []);

  const context = useMemo(() => {
    const base = resolveAdminAiSurfaceContext(
      pathname,
      new URLSearchParams(searchParams.toString()),
      hash,
    );
    const active = [...registrations.values()].at(-1);
    const activeFilters = Object.fromEntries(
      Object.entries(active?.filters ?? {}).flatMap(([key, value]) => {
        if (value === undefined) return [];
        return [[key, typeof value === 'string' ? value.slice(0, 200) : value]];
      }),
    );
    return adminAiSurfaceContextSchema.parse({
      ...base,
      locale,
      filters: { ...base.filters, ...activeFilters },
      selection: active?.selection === undefined ? base.selection : active.selection,
    });
  }, [hash, locale, pathname, registrations, searchParams]);

  const value = useMemo(() => ({ context, register }), [context, register]);
  return (
    <AdminAiSurfaceContext.Provider value={value}>
      {className ? <div className={className}>{children}</div> : children}
    </AdminAiSurfaceContext.Provider>
  );
}

export function useAdminAiSurfaceContext() {
  return useContext(AdminAiSurfaceContext).context;
}

export function useAdminAiSurfaceDetails(details: AdminAiSurfaceDetails) {
  const id = useId();
  const { register } = useContext(AdminAiSurfaceContext);
  const serialized = JSON.stringify(details);

  useEffect(() => {
    register(id, JSON.parse(serialized) as AdminAiSurfaceDetails);
    return () => register(id, null);
  }, [id, register, serialized]);
}
