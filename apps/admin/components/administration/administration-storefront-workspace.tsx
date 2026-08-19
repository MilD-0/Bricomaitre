'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { StorefrontSettingsInputValue } from '@bric/storefront-core/settings';

import type { StorefrontAnnouncementAdmin } from '../../lib/storefront-content';
import { StorefrontContentManager } from '../settings/storefront-content-manager';
import { StorefrontSettingsForm } from '../settings/storefront-settings-form';

export function AdministrationStorefrontWorkspace({
  settings,
  modelOptions,
  content,
}: {
  settings: StorefrontSettingsInputValue;
  modelOptions: string[];
  content: StorefrontAnnouncementAdmin;
}) {
  const t = useTranslations('storefrontSettings');
  const configuration = (
    <StorefrontSettingsForm initialSettings={settings} modelOptions={modelOptions} />
  );
  const announcement = <StorefrontContentManager initialContent={content} />;

  return (
    <div className="px-4 pb-8 sm:px-7">
      <div className="flex items-center gap-3 pt-6 sm:pt-8">
        <Bot className="size-5 text-muted-foreground" />
        <h2 className="font-semibold">{t('title')}</h2>
      </div>
      {configuration}
      {announcement}
    </div>
  );
}
