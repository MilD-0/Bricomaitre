import { describe, expect, it } from 'vitest';

import {
  ADMIN_LEGACY_UI_COOKIE,
  parseLegacyUiPreference,
  serializeLegacyUiPreference,
} from './admin-ui-preference';

describe('admin UI preference', () => {
  it('keeps legacy UI enabled when no preference has been stored', () => {
    expect(parseLegacyUiPreference(undefined)).toBe(true);
    expect(parseLegacyUiPreference(null)).toBe(true);
    expect(parseLegacyUiPreference('1')).toBe(true);
    expect(parseLegacyUiPreference('unexpected')).toBe(true);
  });

  it('only disables legacy UI for the explicit opt-in value', () => {
    expect(parseLegacyUiPreference('0')).toBe(false);
  });

  it('serializes a durable, scoped preference cookie', () => {
    expect(serializeLegacyUiPreference(false, false)).toBe(
      `${ADMIN_LEGACY_UI_COOKIE}=0; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    expect(serializeLegacyUiPreference(true, true)).toBe(
      `${ADMIN_LEGACY_UI_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });
});
