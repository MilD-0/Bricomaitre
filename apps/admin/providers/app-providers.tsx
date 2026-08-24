'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ThemeProvider } from '../components/theme-provider';
import { MotionProvider } from '../components/ui/motion';
import { Toaster } from '../components/ui/toaster';
import { ADMIN_AI_MUTATION_EVENT } from '../lib/admin-ai-events';

function AdminAiMutationSync() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const synchronize = () => {
      void queryClient.invalidateQueries({ refetchType: 'active' });
      router.refresh();
    };
    window.addEventListener(ADMIN_AI_MUTATION_EVENT, synchronize);
    return () => window.removeEventListener(ADMIN_AI_MUTATION_EVENT, synchronize);
  }, [queryClient, router]);

  return null;
}

export function AppProviders({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, string>;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MotionProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
            <AdminAiMutationSync />
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
