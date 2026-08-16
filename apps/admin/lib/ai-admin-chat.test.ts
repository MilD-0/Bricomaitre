import { describe, expect, it } from 'vitest';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from './ai-admin-chat';

describe('admin AI chat instructions', () => {
  it('prevents duplicate analytics calls and overclaiming proposal activation', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('at most once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inactive listings');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('unpublished drafts');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Never say approval alone makes them active');
  });

  it('requires taxonomy resolution and keeps new taxonomy entities in draft state', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('find_brands');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('find_categories');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inactive drafts');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('deactivation');
  });

  it('requires verified persistence before treating an approved task as complete', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('verified persistence');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('task is not complete');
  });

  it('routes catalog-wide categorization through one reconciled background job', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('call categorize_catalog exactly once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Do not emulate a batch with find_products');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('reconciled summary reports complete');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('get_catalog_categorization_status');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('actual status and progress');
  });

  it('routes product scopes over 20 and catalog-wide missing content to background jobs', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('more than 20 products');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('scope all_missing');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Arabic titles');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('get_product_content_job_status');
  });

  it('requires exact snapshots and explicit instructions for system-wide job control', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('list_background_jobs');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('get_background_job');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('explicit user request');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Never claim a job stopped');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('server owns the task');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain(
      'Do not ask the user to prompt you to check later',
    );
  });
});
