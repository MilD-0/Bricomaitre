import { describe, expect, it } from 'vitest';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from './ai-admin-chat';

describe('admin AI chat instructions', () => {
  it('prevents duplicate analytics calls and overclaiming proposal activation', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('answer immediately without another query');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('never issue an identical query twice');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('requested versus effective ranges');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Use focus.dimension');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('derive totals from visible ranked rows');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inactive records');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Never say approval alone makes them active');
  });

  it('requires taxonomy resolution and executes exact taxonomy changes directly', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('find_brands');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('find_categories');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('call manage_taxonomy exactly once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Category hierarchy conflicts');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain(
      'Assistant-invented taxonomy recommendations remain reviewable proposals',
    );
  });

  it('requires verified persistence before treating an approved task as complete', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('verified persistence');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('task is not complete');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('machine-readable code and nextAction');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('live records moved');
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
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('expose its download directly in chat');
  });

  it('keeps expired proposal cleanup exact, explicit, and permission-scoped', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('delete_expired_ai_proposals');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('expiresAt is already in the past');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('must remain untouched');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('rejection and deletion are different actions');
  });

  it('uses surface selections and complete canonical operational records', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('exact selected IDs');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_orders');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_administration');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('complete operational records');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('customer and staff identity');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('exact domain permissions');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('saved canonical tool evidence');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('retain exact IDs');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('saved record may have changed');
  });

  it('requires provider choice, partial-result evidence, and documented repairs for ECOTRACK posting', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('preview_ecotrack_posting first');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Africa/Algiers');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('choose Delivro or Emir');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('load_ecotrack_requirements');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('never invent a carrier destination');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('preview the repaired exact IDs again');
  });

  it('treats landing-page creation and exact preservation-safe edits as cross-workspace actions', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('product and asset conversations');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('Preserve every unaffected block exactly');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('explicitly requests that exact deletion');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('omitted model-plan block is not deletion');
  });

  it('creates and deletes local orders through canonical lifecycle workflows', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('explicit new admin order');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('calling create_order once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('duplicate-phone candidates');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('submitted demand, not a completed sale');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('call delete_orders once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('external carrier shipment may remain');
  });

  it('operates the complete native inventory workflow', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('native scanner');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('scan_inventory');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('receive_inventory');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('unmatched order lines');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('update_inventory_state');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('null clears a barcode');
  });

  it('updates complete storefront configuration through explicit operations', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('address, map or Facebook links');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('one field/value operation');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('preserve every omitted field');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('null clears');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('configured model IDs');
  });

  it('operates shared order shopping lists without summing visible rows', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('shared operational drafts');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_order_shopping_list');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('complete cohort');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('save_order_shopping_list');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('apply_order_shopping_list_inventory');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('separate stock-decrease mutation');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('use selection all with draftIds []');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('applicationSummary.appliedUnits');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain(
      'Never claim previewing or saving deducted inventory',
    );
  });

  it('uses native tracking-link and preview-first order export workflows', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('get_order_tracking_links');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('do not claim the assistant copied');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('preview_order_export');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('native seven-day created-date rule');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('transitions successfully exported orders');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('never start order_export');
  });

  it('sets Bulletin reactions to the requested state instead of blindly toggling', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('set_bulletin_reaction');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('action add or remove');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('changed false');
  });

  it('operates posted ECOTRACK shipments through the native ledger contract', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_ecotrack_shipments');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('manage_ecotrack_shipments once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('askCollection means requesting carrier pickup');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('ready to download, never already printed');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('change_ecotrack_shipments');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('loaded and preserved server-side');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('would leave ECOTRACK stale');
  });

  it('inspects and recovers action history through the native transactional contract', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_action_history');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('action-log ID from its entity ID');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('semantic before/after changes');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('recover_action_history');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('newest-to-oldest order when undoing');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('oldest-to-newest order when redoing');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('server revalidates each item');
  });

  it('treats archived products as a readable and recoverable native lifecycle', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('inspect_archived_products');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('call restore_products once');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('only removes archived state');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('never claim it is live, sellable, or in stock');
  });

  it('revokes staff access only by exact inspected grant ID', () => {
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('exact access-grant ID');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('revoke_access_grants');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain('every revoked identity');
    expect(ADMIN_AI_CHAT_INSTRUCTIONS).toContain(
      'never describe a role reassignment as revocation',
    );
  });
});
