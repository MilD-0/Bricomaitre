'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { openAdminAi } from '../lib/admin-ai-events';
import { Button } from './ui/button';

export function AdminAiAskButton({ className }: { className?: string }) {
  const t = useTranslations('aiChat');

  return (
    <Button type="button" size="sm" variant="outline" className={className} onClick={openAdminAi}>
      <Sparkles className="size-4" aria-hidden="true" />
      {t('ask')}
    </Button>
  );
}
