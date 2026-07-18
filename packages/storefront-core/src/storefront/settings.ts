import { z } from 'zod';

export const DEFAULT_STOREFRONT_CONTACT_PHONE = '0795342826';

export function normalizeAlgerianPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('00213')) return `0${digits.slice(5)}`;
  if (digits.startsWith('213')) return `0${digits.slice(3)}`;
  return digits;
}

export const algerianPhoneNumberSchema = z.string()
  .trim()
  .min(1)
  .transform(normalizeAlgerianPhoneNumber)
  .pipe(z.string().regex(/^0[567]\d{8}$/, 'Enter a valid Algerian phone number.'));

export const storefrontSettingsInputSchema = z.object({
  contactPhone: algerianPhoneNumberSchema,
  phoneEnabled: z.boolean(),
  aiAssistantEnabled: z.boolean().default(true),
});

export type StorefrontSettingsInput = z.infer<typeof storefrontSettingsInputSchema>;

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettingsInput = {
  contactPhone: DEFAULT_STOREFRONT_CONTACT_PHONE,
  phoneEnabled: true,
  aiAssistantEnabled: true,
};

export function formatAlgerianPhoneNumber(value: string) {
  const phone = algerianPhoneNumberSchema.parse(value);
  return `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6, 8)} ${phone.slice(8, 10)}`;
}

export function toStorefrontContactSettings(input: StorefrontSettingsInput) {
  const settings = storefrontSettingsInputSchema.parse(input);
  const internationalDigits = `213${settings.contactPhone.slice(1)}`;

  return {
    phoneDisplay: formatAlgerianPhoneNumber(settings.contactPhone),
    phoneHref: `tel:+${internationalDigits}`,
    // Phone support is always available. Preserve the legacy response field
    // while preventing outdated stored toggles from hiding contact actions.
    phoneEnabled: true,
    aiAssistantEnabled: settings.aiAssistantEnabled,
  };
}
