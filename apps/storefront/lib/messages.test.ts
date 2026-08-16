import { describe, expect, it } from 'vitest';

import ar from '../messages/ar.json';
import fr from '../messages/fr.json';

type Catalog = Record<string, unknown>;

function flatten(catalog: Catalog, prefix = '', result = new Map<string, string>()) {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Catalog, path, result);
    } else if (typeof value === 'string') {
      result.set(path, value);
    }
  }
  return result;
}

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)(?:,|\})/g)].map((match) => match[1]).sort();
}

describe('storefront message catalogs', () => {
  const catalogs = { fr: flatten(fr), ar: flatten(ar) };
  const canonicalKeys = [...catalogs.fr.keys()].sort();

  it('keeps Arabic keys aligned with the canonical French catalog', () => {
    expect([...catalogs.ar.keys()].sort()).toEqual(canonicalKeys);
  });

  it('uses the same interpolation parameters in both locales', () => {
    const mismatches = canonicalKeys.filter(
      (key) =>
        JSON.stringify(placeholders(catalogs.ar.get(key) ?? '')) !==
        JSON.stringify(placeholders(catalogs.fr.get(key) ?? '')),
    );

    expect(mismatches).toEqual([]);
  });
});
