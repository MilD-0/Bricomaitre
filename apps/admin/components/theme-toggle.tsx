'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

import { Button } from './ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isDark = (selectedTheme ?? resolvedTheme) === 'dark';

  const selectTheme = (nextTheme: 'light' | 'dark') => {
    setSelectedTheme(nextTheme);
    setTheme(nextTheme);
    // Keep the control reliable even if the provider is still settling during hydration.
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem('theme', nextTheme);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-9 px-0"
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Theme toggle'}
      onClick={() => selectTheme(isDark ? 'light' : 'dark')}
    >
      {mounted ? isDark ? <SunMedium /> : <MoonStar /> : null}
    </Button>
  );
}
