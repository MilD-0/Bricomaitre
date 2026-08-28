import { describe, expect, it } from 'vitest';

import { parseLandingPagePreviewSearchParams } from './landing-page-preview';

describe('landing-page preview query', () => {
  it('parses one complete signed revision and rejects partial or ambiguous values', () => {
    expect(
      parseLandingPagePreviewSearchParams({
        previewRevision: '3',
        previewTimestamp: '1787817600000',
        previewSignature: 'a'.repeat(64),
      }),
    ).toEqual({
      requested: true,
      preview: {
        revision: 3,
        timestamp: '1787817600000',
        signature: 'a'.repeat(64),
      },
    });
    expect(parseLandingPagePreviewSearchParams({})).toEqual({
      requested: false,
      preview: null,
    });
    expect(
      parseLandingPagePreviewSearchParams({
        previewRevision: ['3', '4'],
        previewTimestamp: '1787817600000',
        previewSignature: 'a'.repeat(64),
      }),
    ).toEqual({ requested: true, preview: null });
  });
});
