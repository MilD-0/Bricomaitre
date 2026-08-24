import { describe, expect, it } from 'vitest';

import { permissionCatalog } from '../lib/permissions';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

describe('admin permission translations', () => {
  it.each([
    ['en', en],
    ['fr', fr],
    ['ar', ar],
  ] as const)('defines every permission label in %s', (_locale, messages) => {
    for (const permission of permissionCatalog) {
      expect(messages.settings.permissionLabels[permission], permission).toBeTypeOf('string');
      expect(messages.settings.permissionLabels[permission].trim(), permission).not.toBe('');
    }
  });

  it.each([
    ['en', en],
    ['fr', fr],
    ['ar', ar],
  ] as const)('defines shared workspace actions in %s', (_locale, messages) => {
    expect(messages.actions.close.trim()).not.toBe('');
  });
});
