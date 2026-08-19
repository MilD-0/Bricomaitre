'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  storefrontSettingsInputSchema,
  type StorefrontSettingsInputValue,
} from '@bric/storefront-core/settings';

import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';

export function StorefrontSettingsForm({
  initialSettings,
  modelOptions,
}: {
  initialSettings: StorefrontSettingsInputValue;
  modelOptions: string[];
}) {
  const t = useTranslations('storefrontSettings');
  const [settings, setSettings] = useState(() =>
    storefrontSettingsInputSchema.parse({ ...initialSettings, phoneEnabled: true }),
  );
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
      const saved = storefrontSettingsInputSchema.parse(await response.json());
      setSettings({ ...saved, phoneEnabled: true });
      toast.success(t('saved'), { id: toastId });
    } catch {
      toast.error(t('saveError'), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="max-w-3xl space-y-7 pt-6 sm:pt-9" onSubmit={submit}>
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
        <Input
          type="email"
          aria-label={t('emailLabel')}
          placeholder={t('emailLabel')}
          value={settings.contactEmail ?? ''}
          onChange={(event) =>
            setSettings((current) => ({ ...current, contactEmail: event.target.value || null }))
          }
        />
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label={t('addressLabel')}
          placeholder={t('addressLabel')}
          value={settings.address ?? ''}
          onChange={(event) =>
            setSettings((current) => ({ ...current, address: event.target.value || null }))
          }
        />
        {(['mapUrl', 'facebookUrl'] as const).map((field) => (
          <Input
            key={field}
            type="url"
            aria-label={t(field)}
            placeholder={t(field)}
            value={settings[field] ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, [field]: event.target.value || null }))
            }
          />
        ))}
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

      <section className="grid gap-4 border-t border-border/70 pt-6">
        <h2 className="text-lg font-semibold text-foreground">{t('assistantRuntimeTitle')}</h2>
        <label className="space-y-1 text-sm font-medium">
          <span>{t('modelLabel')}</span>
          <select
            aria-label={t('modelLabel')}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={settings.aiModel}
            disabled={modelOptions.length === 0}
            onChange={(event) =>
              setSettings((current) => ({ ...current, aiModel: event.target.value }))
            }
          >
            {modelOptions.length === 0 ? (
              <option value={settings.aiModel}>{t('noModels')}</option>
            ) : null}
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </section>

      <Button type="submit" disabled={saving || modelOptions.length === 0}>
        {saving ? t('savingAction') : t('saveAction')}
      </Button>
    </form>
  );
}
