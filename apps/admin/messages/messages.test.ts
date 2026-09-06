import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

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

describe('admin message catalogs', () => {
  const catalogs = { en: flatten(en), fr: flatten(fr), ar: flatten(ar) };
  const canonicalKeys = [...catalogs.fr.keys()].sort();

  it.each(Object.entries({ en, fr, ar }))(
    '%s has complete, valid messages for the formatter',
    (locale, messages) => {
      const catalog = flatten(messages);
      expect([...catalog.keys()].sort()).toEqual(canonicalKeys);
      const translate = createTranslator({
        locale,
        messages,
        onError: (error) => {
          throw error;
        },
      });
      for (const [key, value] of catalog) {
        expect(value.trim(), key).not.toBe('');
        const values = Object.fromEntries(placeholders(value).map((name) => [name, 2]));
        expect(() => translate(key as Parameters<typeof translate>[0], values), key).not.toThrow();
      }
    },
  );

  it('uses the same interpolation parameters in every locale', () => {
    const mismatches = canonicalKeys.flatMap((key) => {
      const expected = placeholders(catalogs.fr.get(key) ?? '');
      return (['en', 'ar'] as const)
        .filter(
          (locale) =>
            JSON.stringify(placeholders(catalogs[locale].get(key) ?? '')) !==
            JSON.stringify(expected),
        )
        .map((locale) => `${locale}:${key}`);
    });

    expect(mismatches).toEqual([]);
  });
});
