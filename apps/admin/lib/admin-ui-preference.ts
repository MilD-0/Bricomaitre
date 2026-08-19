export const ADMIN_LEGACY_UI_COOKIE = 'bric-admin-legacy-ui';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function parseLegacyUiPreference(value: string | null | undefined) {
  return value !== '0';
}

export function serializeLegacyUiPreference(value: boolean, secure: boolean) {
  return [
    `${ADMIN_LEGACY_UI_COOKIE}=${value ? '1' : '0'}`,
    'Path=/',
    `Max-Age=${ONE_YEAR_IN_SECONDS}`,
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}
