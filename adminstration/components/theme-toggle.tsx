'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

import { Button } from './ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-9 px-0"
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Theme toggle'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted ? (
        isDark ? (
          <SunMedium />
        ) : (
          <MoonStar />
        )
      ) : null}
    </Button>
  );
}
