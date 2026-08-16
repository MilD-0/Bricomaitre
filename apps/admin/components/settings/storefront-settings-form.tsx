'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { StorefrontSettingsInput } from '@bric/storefront-core/settings';

import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';

export function StorefrontSettingsForm({
  initialSettings,
}: {
  initialSettings: StorefrontSettingsInput;
}) {
  const t = useTranslations('storefrontSettings');
  const [settings, setSettings] = useState({ ...initialSettings, phoneEnabled: true });
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const toastId = toast.loading(t('saving'));

    try {
      const response = await fetch('/api/storefront-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...settings, phoneEnabled: true }),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved = (await response.json()) as StorefrontSettingsInput;
      setSettings({ ...saved, phoneEnabled: true });
      toast.success(t('saved'), { id: toastId });
    } catch {
      toast.error(t('saveError'), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="max-w-2xl space-y-7 pt-6 sm:pt-9" onSubmit={submit}>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{t('contactTitle')}</h2>
        <Input
          id="storefront-contact-phone"
          aria-label={t('contactTitle')}
          inputMode="tel"
          autoComplete="tel"
          value={settings.contactPhone}
          onChange={(event) =>
            setSettings((current) => ({ ...current, contactPhone: event.target.value }))
          }
          placeholder="0795 34 28 26"
          required
        />
      </section>

      <section className="flex items-center justify-between gap-4 border-t border-border/70 pt-6">
        <h2 className="text-lg font-semibold text-foreground">{t('assistantTitle')}</h2>
        <Switch
          checked={settings.aiAssistantEnabled}
          onCheckedChange={(checked) =>
            setSettings((current) => ({ ...current, aiAssistantEnabled: checked }))
          }
          aria-label={t('assistantTitle')}
        />
      </section>

      <Button type="submit" disabled={saving}>
        {saving ? t('savingAction') : t('saveAction')}
      </Button>
    </form>
  );
}
