'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { StorefrontSettingsInput } from '@bric/storefront-core/settings';

import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';

export function StorefrontSettingsForm({ initialSettings }: { initialSettings: StorefrontSettingsInput }) {
  const t = useTranslations('storefrontSettings');
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const toastId = toast.loading(t('saving'));

    try {
      const response = await fetch('/api/storefront-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved = await response.json() as StorefrontSettingsInput;
      setSettings(saved);
      toast.success(t('saved'), { id: toastId });
    } catch {
      toast.error(t('saveError'), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t('description')}</p>
      </header>

      <form className="max-w-2xl overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-sm" onSubmit={submit}>
        <div className="border-b border-border/70 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-foreground">{t('contactTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('contactDescription')}</p>
        </div>
        <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
          <label className="block space-y-2" htmlFor="storefront-contact-phone">
            <span className="text-sm font-medium text-foreground">{t('phoneLabel')}</span>
            <Input
              id="storefront-contact-phone"
              inputMode="tel"
              autoComplete="tel"
              value={settings.contactPhone}
              onChange={(event) => setSettings((current) => ({ ...current, contactPhone: event.target.value }))}
              placeholder="0795 34 28 26"
              required
            />
            <span className="block text-xs leading-5 text-muted-foreground">{t('phoneHint')}</span>
          </label>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 rounded-[1.1rem] border border-border/70 bg-muted/20 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-foreground">{t('callsLabel')}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('callsHint')}</span>
              </span>
              <Switch
                checked={settings.phoneEnabled}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, phoneEnabled: checked }))}
                aria-label={t('callsLabel')}
              />
            </label>
          </div>

          <Button type="submit" disabled={saving}>{saving ? t('savingAction') : t('saveAction')}</Button>
        </div>
      </form>
    </div>
  );
}
