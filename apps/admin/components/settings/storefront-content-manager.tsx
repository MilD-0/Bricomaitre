'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { StorefrontAnnouncementAdmin } from '../../lib/storefront-content';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

export function StorefrontContentManager({
  initialContent,
}: {
  initialContent: StorefrontAnnouncementAdmin;
}) {
  const t = useTranslations('storefrontSettings');
  const [announcement, setAnnouncement] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const toastId = toast.loading(t('saving'));
    try {
      const response = await fetch('/api/storefront-content', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      if (!response.ok) throw new Error(await response.text());
      toast.success(t('saved'), { id: toastId });
    } catch {
      toast.error(t('saveError'), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  const missingActiveMessage =
    announcement.active && (!announcement.messageFr.trim() || !announcement.messageAr.trim());

  return (
    <section className="max-w-3xl space-y-4 border-t border-border/70 pt-8">
      <h2 className="text-lg font-semibold">{t('announcementTitle')}</h2>
      <label className="grid gap-1 text-sm font-medium">
        <span>{t('announcementMessageFr')}</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={announcement.messageFr}
          maxLength={300}
          onChange={(event) =>
            setAnnouncement((current) => ({ ...current, messageFr: event.target.value }))
          }
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        <span>{t('announcementMessageAr')}</span>
        <textarea
          dir="rtl"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={announcement.messageAr}
          maxLength={300}
          onChange={(event) =>
            setAnnouncement((current) => ({ ...current, messageAr: event.target.value }))
          }
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>{t('active')}</span>
        <Switch
          checked={announcement.active}
          onCheckedChange={(active) => setAnnouncement((current) => ({ ...current, active }))}
        />
      </label>
      <Button type="button" disabled={saving || missingActiveMessage} onClick={() => void save()}>
        {t('saveAnnouncement')}
      </Button>
    </section>
  );
}
