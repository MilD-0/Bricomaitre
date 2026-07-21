import { describe, expect, it } from 'vitest';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from './ai-admin-chat';

describe('admin AI chat instructions', () => {
  it('prevents duplicate analytics calls and overclaiming proposal activation', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('at most once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inactive listings');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('unpublished drafts');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Never say approval alone makes them active');
  });
});
