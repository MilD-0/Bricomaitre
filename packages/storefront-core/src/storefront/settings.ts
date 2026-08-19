import { z } from 'zod';

export const DEFAULT_STOREFRONT_CONTACT_PHONE = '0795342826';

export function normalizeAlgerianPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('00213')) return `0${digits.slice(5)}`;
  if (digits.startsWith('213')) return `0${digits.slice(3)}`;
  return digits;
}

export const algerianPhoneNumberSchema = z
  .string()
  .trim()
  .min(1)
  .transform(normalizeAlgerianPhoneNumber)
  .pipe(z.string().regex(/^0[567]\d{8}$/, 'Enter a valid Algerian phone number.'));

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => value || null);
const nullableUrl = z
  .union([z.url(), z.literal(''), z.null()])
  .default(null)
  .transform((value) => value || null);

export const storefrontSettingsInputSchema = z.object({
  contactPhone: algerianPhoneNumberSchema,
  phoneEnabled: z.boolean(),
  contactEmail: z
    .union([z.email(), z.literal(''), z.null()])
    .default(null)
    .transform((value) => value || null),
  address: nullableText(500),
  mapUrl: nullableUrl,
  facebookUrl: nullableUrl,
  aiAssistantEnabled: z.boolean().default(true),
  aiModel: z.string().trim().min(1).max(120).default('gpt-5-mini'),
  aiFallbackModel: nullableText(120),
});

export type StorefrontSettingsInput = z.infer<typeof storefrontSettingsInputSchema>;
export type StorefrontSettingsInputValue = z.input<typeof storefrontSettingsInputSchema>;

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettingsInput = {
  contactPhone: DEFAULT_STOREFRONT_CONTACT_PHONE,
  phoneEnabled: true,
  contactEmail: 'bricomaitre@gmail.com',
  address: 'BT N20, Cité 08 Mai 45, Bab Ezzouar 16024, Alger',
  mapUrl: 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61562272954715',
  aiAssistantEnabled: true,
  aiModel: 'gpt-5-mini',
  aiFallbackModel: null,
};

export function formatAlgerianPhoneNumber(value: string) {
  const phone = algerianPhoneNumberSchema.parse(value);
  return `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6, 8)} ${phone.slice(8, 10)}`;
}

export function toStorefrontContactSettings(input: StorefrontSettingsInputValue) {
  const settings = storefrontSettingsInputSchema.parse(input);
  const internationalDigits = `213${settings.contactPhone.slice(1)}`;
  const contactEmail = settings.contactEmail ?? DEFAULT_STOREFRONT_SETTINGS.contactEmail;
  const address = settings.address ?? DEFAULT_STOREFRONT_SETTINGS.address;
  const mapUrl = settings.mapUrl ?? DEFAULT_STOREFRONT_SETTINGS.mapUrl;
  const facebookUrl = settings.facebookUrl ?? DEFAULT_STOREFRONT_SETTINGS.facebookUrl;

  return {
    phoneDisplay: formatAlgerianPhoneNumber(settings.contactPhone),
    phoneHref: `tel:+${internationalDigits}`,
    // Phone support is always available. Preserve the legacy response field
    // while preventing outdated stored toggles from hiding contact actions.
    phoneEnabled: true,
    aiAssistantEnabled: settings.aiAssistantEnabled,
    contactEmail,
    address,
    mapUrl,
    facebookUrl,
    aiModel: settings.aiModel,
    aiFallbackModel: settings.aiFallbackModel,
  };
}
