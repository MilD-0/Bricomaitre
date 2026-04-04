import { describe, expect, it } from 'vitest';

import {
  bulletinComposerFormSchema,
  bulletinPostSchema,
  canDeleteBulletinPost,
  canModerateBulletin,
  formatBulletinTags,
  parseBulletinTags,
} from './bulletin';

describe('bulletin schemas', () => {
  it('accepts valid bulletin posts and normalizes tags', () => {
    const parsed = bulletinPostSchema.parse({
      title: 'Warehouse handoff',
      body: 'The paint shipment arrived and has been checked into the back room.',
      tags: ['Logistics', ' logistics ', 'Urgent'],
      pinned: true,
    });

    expect(parsed.tags).toEqual(['logistics', 'urgent']);
  });

  it('validates the composer form and tag helpers', () => {
    expect(
      bulletinComposerFormSchema.safeParse({
        title: 'Hi',
        body: 'short',
        tagsInput: 'ops, qa',
      }).success,
    ).toBe(false);

    expect(parseBulletinTags('ops, qa, ops')).toEqual(['ops', 'qa']);
    expect(formatBulletinTags(['ops', 'qa'])).toBe('ops, qa');
  });
});

describe('bulletin permissions', () => {
  it('allows owners to delete their own post without moderator rights', () => {
    expect(
      canDeleteBulletinPost({
        postAuthorId: 'user-1',
        userId: 'user-1',
        permissions: [],
      }),
    ).toBe(true);
  });

  it('requires bulletin_moderate to act on other users posts', () => {
    expect(canModerateBulletin(['bulletin_moderate'])).toBe(true);
    expect(
      canDeleteBulletinPost({
        postAuthorId: 'user-1',
        userId: 'user-2',
        permissions: [],
      }),
    ).toBe(false);
    expect(
      canDeleteBulletinPost({
        postAuthorId: 'user-1',
        userId: 'user-2',
        permissions: ['bulletin_moderate'],
      }),
    ).toBe(true);
  });
});
