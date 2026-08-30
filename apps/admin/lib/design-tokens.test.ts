import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCubicBezier, parseDurationSeconds } from './design-tokens';

const appRoot = resolve(import.meta.dirname, '..');

function productionSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (entry === 'tests' || entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return productionSources(path);
    if (!['.ts', '.tsx'].includes(extname(entry)) || entry.includes('.test.')) return [];
    return [readFileSync(path, 'utf8')];
  });
}

describe('admin design tokens', () => {
  it('parses root-controlled Motion values and retains safe fallbacks', () => {
    expect(parseDurationSeconds('240ms', 1)).toBe(0.24);
    expect(parseDurationSeconds('0.5s', 1)).toBe(0.5);
    expect(parseDurationSeconds('initial', 0.2)).toBe(0.2);
    expect(parseCubicBezier('cubic-bezier(0.22, 1, 0.36, 1)')).toEqual([0.22, 1, 0.36, 1]);
    expect(parseCubicBezier('initial')).toEqual([0.22, 1, 0.36, 1]);
  });

  it('keeps every major design-language axis at the root', () => {
    const globals = readFileSync(resolve(appRoot, 'app/globals.css'), 'utf8');
    for (const token of [
      '--layout-unit',
      '--type-font-family-sans',
      '--type-size-base',
      '--type-weight-semibold',
      '--type-leading-normal',
      '--type-tracking-normal',
      '--shape-radius-control',
      '--control-height-default',
      '--focus-ring-width',
      '--elevation-md',
      '--duration-standard',
      '--ease-standard',
      '--background',
      '--primary',
      '--border',
    ]) {
      expect(globals, `missing ${token}`).toMatch(new RegExp(`\\s${token}:`));
    }
  });

  it('prevents component-local design literals from returning', () => {
    const source = [
      ...productionSources(resolve(appRoot, 'app')),
      ...productionSources(resolve(appRoot, 'components')),
    ].join('\n');

    expect(source).not.toMatch(
      /(?:rounded|text|tracking|leading|duration)-\[(?![^\]]*var\()[^\]]+\]/,
    );
    expect(source).not.toMatch(/shadow-\[(?![^\]]*var\()[^\]]+\]/);
    expect(source).not.toMatch(/transition=\{\{[^}]*duration:\s*0\./);
    expect(source).not.toMatch(/fontSize=\{\d+\}/);
  });
});
