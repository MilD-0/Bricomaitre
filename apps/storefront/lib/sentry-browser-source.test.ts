import { describe, expect, it } from 'vitest';
import { readBrowserErrorSource } from './sentry-browser-source';
import { sanitizeSentryEvent } from './sentry-config';

describe('bootstrap browser error source', () => {
  it('removes credentials before bounding a long source URL', () => {
    expect(
      readBrowserErrorSource({
        filename: `https://user:${'secret'.repeat(300)}@bricomaitre.com/chunk.js?token=secret`,
        lineno: 1,
        colno: 2,
      }).sourceUrl,
    ).toBe('https://bricomaitre.com/chunk.js');
  });
  it('retains native wrapper locations without query strings or fragments', () => {
    const source = readBrowserErrorSource({
      filename: 'app://navigation_logger?token=secret#details',
      lineno: 1,
      colno: 42,
    });
    expect(source).toEqual({
      sourceUrl: 'app://navigation_logger',
      lineNumber: 1,
      columnNumber: 42,
    });
    expect(
      sanitizeSentryEvent({ request: {}, contexts: { browser_error: source } }).contexts
        .browser_error,
    ).toEqual(source);
  });
  it('keeps unavailable source coordinates unknown rather than inventing a stack frame', () => {
    expect(readBrowserErrorSource({ filename: '', lineno: 0, colno: 0 })).toEqual({
      sourceUrl: null,
      lineNumber: null,
      columnNumber: null,
    });
  });
});
