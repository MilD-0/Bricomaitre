import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { ecotrackCommunes, ecotrackWilayas } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

export type MetaRequestContext = {
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  externalIdSource?: string | null;
};

export type MetaOrderLocation = {
  stateName: string | null;
  postalCode: string | null;
};

function normalizeText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveMetaOrderLocation(
  catalog: {
    wilayas: Array<{ wilayaId: number; name: string }>;
    communes: Array<{
      communeId: number;
      wilayaId: number;
      name: string;
      postalCode: string | null;
    }>;
  },
  state: number | null,
  city: string | null,
): MetaOrderLocation {
  if (state == null) return { stateName: null, postalCode: null };
  const stateName =
    catalog.wilayas.find((wilaya) => wilaya.wilayaId === state)?.name ?? String(state);
  const cityValue = city?.trim() ?? '';
  const normalizedCity = normalizeText(cityValue);
  const commune = catalog.communes.find(
    (entry) =>
      entry.wilayaId === state &&
      (String(entry.communeId) === cityValue ||
        (normalizedCity !== null && normalizeText(entry.name) === normalizedCity)),
  );
  return { stateName, postalCode: commune?.postalCode?.trim() || null };
}

export async function readMetaOrderLocation(
  db: Executor,
  state: number | null,
  city: string | null,
) {
  if (state == null) return { stateName: null, postalCode: null };
  const [wilayas, communes] = await Promise.all([
    db
      .select({
        wilayaId: ecotrackWilayas.wilayaId,
        name: ecotrackWilayas.name,
      })
      .from(ecotrackWilayas)
      .where(eq(ecotrackWilayas.wilayaId, state)),
    db
      .select({
        communeId: ecotrackCommunes.communeId,
        wilayaId: ecotrackCommunes.wilayaId,
        name: ecotrackCommunes.name,
        postalCode: ecotrackCommunes.postalCode,
      })
      .from(ecotrackCommunes)
      .where(eq(ecotrackCommunes.wilayaId, state)),
  ]);
  return resolveMetaOrderLocation({ wilayas, communes }, state, city);
}

export function normalizeAlgeriaPhone(value: string | null | undefined) {
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `213${digits.slice(1)}`;
  if (!digits.startsWith('213') && digits.length === 9) digits = `213${digits}`;
  return /^213\d{8,9}$/.test(digits) ? digits : null;
}

export function hashMetaValue(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

function hashAlreadyNormalized(value: string | null) {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

export function isValidFbc(value: string | null | undefined) {
  return Boolean(value && /^fb\.\d+\.\d+\..+/.test(value.trim()));
}

export function isValidFbp(value: string | null | undefined) {
  return Boolean(value && /^fb\.\d+\.\d+\.\d+/.test(value.trim()));
}

export function buildMetaUserData(input: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  externalIdSource?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}) {
  const phone = normalizeAlgeriaPhone(input.phone);
  const data: Record<string, string> = {};
  const hashedFields = {
    em: hashMetaValue(input.email),
    fn: hashMetaValue(input.firstName),
    ln: hashMetaValue(input.lastName),
    ph: hashAlreadyNormalized(phone),
    ct: hashMetaValue(input.city),
    st: hashMetaValue(input.state),
    zp: hashMetaValue(input.postalCode),
    country: hashMetaValue('dz'),
    external_id: hashMetaValue(input.externalIdSource),
  };

  for (const [key, value] of Object.entries(hashedFields)) {
    if (value) data[key] = value;
  }
  if (isValidFbc(input.fbc)) data.fbc = input.fbc!.trim();
  if (isValidFbp(input.fbp)) data.fbp = input.fbp!.trim();
  if (input.clientIpAddress?.trim()) data.client_ip_address = input.clientIpAddress.trim();
  if (input.clientUserAgent?.trim()) data.client_user_agent = input.clientUserAgent.trim();
  return data;
}

export function getMetaMatchKeySummary(userData: Record<string, unknown>) {
  return Object.keys(userData)
    .filter((key) => userData[key] !== null && userData[key] !== undefined && userData[key] !== '')
    .sort();
}
