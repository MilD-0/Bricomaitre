import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseDurationSeconds } from './design-tokens';

const appRoot = resolve(import.meta.dirname, '..');
const stylesRoot = resolve(appRoot, 'app/styles');

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (entry === 'tests' || entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return productionFiles(path);
    if (!['.css', '.ts', '.tsx'].includes(extname(entry)) || entry.includes('.test.')) return [];
    return [path];
  });
}

describe('storefront design tokens', () => {
  it('parses root-controlled Motion durations and retains safe fallbacks', () => {
    expect(parseDurationSeconds('180ms', 1)).toBe(0.18);
    expect(parseDurationSeconds('0.5s', 1)).toBe(0.5);
    expect(parseDurationSeconds('initial', 0.3)).toBe(0.3);
  });

  it('declares every storefront design token used by production code', () => {
    const globals = readFileSync(resolve(appRoot, 'app/globals.css'), 'utf8');
    const declared = new Set(
      [...globals.matchAll(/^\s*(--sf-[\w-]+)\s*:/gm)].map((match) => match[1]),
    );
    const source = productionFiles(appRoot)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const used = new Set([...source.matchAll(/var\(\s*(--sf-[\w-]+)/g)].map((match) => match[1]));

    expect([...used].filter((token) => !declared.has(token))).toEqual([]);
    for (const axis of [
      '--sf-density',
      '--sf-font-sans',
      '--sf-text-strong',
      '--sf-surface-raised',
      '--sf-border-default',
      '--sf-type-body',
      '--sf-weight-semibold',
      '--sf-leading-normal',
      '--sf-tracking-normal',
      '--sf-radius-control',
      '--sf-shadow-raised',
      '--sf-duration-standard',
      '--sf-ease-standard',
    ]) {
      expect(declared.has(axis), `missing ${axis}`).toBe(true);
    }
  });

  it('keeps route styles behind semantic root controls', () => {
    const failures: string[] = [];
    for (const file of productionFiles(stylesRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
        const property = match[1].toLowerCase();
        const value = match[2].trim();
        const location = `${file.slice(stylesRoot.length + 1)}: ${property}: ${value}`;
        const usesSemanticToken = /var\(\s*--sf-/.test(value);

        if (
          /^(?:font-size|font-weight|line-height|letter-spacing)$/.test(property) &&
          !value.startsWith('var(')
        ) {
          failures.push(location);
        }
        if (property.includes('radius') && !value.startsWith('var(')) failures.push(location);
        if (
          /^(?:box|text)-shadow$/.test(property) &&
          value !== 'none' &&
          !value.startsWith('var(')
        ) {
          failures.push(location);
        }
        if (/#[0-9a-f]{3,8}\b|rgba?\(|\b(?:white|black)\b/i.test(value) && !usesSemanticToken) {
          failures.push(location);
        }
        if (
          /^(?:transition|animation|animation-delay|animation-duration)$/.test(property) &&
          /\b(?:\d+\.?\d*|\.\d+)(?:ms|s)\b/.test(value) &&
          !/var\(\s*--sf-duration-/.test(value)
        ) {
          failures.push(location);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
