'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';

import { ThemeProvider } from '../components/theme-provider';
import { MotionProvider } from '../components/ui/motion';
import { Toaster } from '../components/ui/toaster';

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
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
