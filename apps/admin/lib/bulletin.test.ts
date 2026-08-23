import { describe, expect, it } from 'vitest';

import {
  bulletinComposerFormSchema,
  bulletinPostPatchSchema,
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

  it('does not materialize omitted post fields in a partial update', () => {
    expect(bulletinPostPatchSchema.parse({ title: 'Updated handoff' })).toEqual({
      title: 'Updated handoff',
    });
  });

  it('rejects bulletin posts whose attachments exceed the aggregate limit', () => {
    const attachment = (name: string) => ({
      fileName: name,
      fileUrl: `https://cdn.example.com/${name}`,
      fileKey: `bulletin/${name}`,
      contentType: 'application/pdf',
      size: 20 * 1024 * 1024,
    });

    expect(
      bulletinPostSchema.safeParse({
        title: 'Large handoff',
        body: 'The attached documents are ready for the warehouse team.',
        tags: [],
        attachments: [
          attachment('one.pdf'),
          attachment('two.pdf'),
          { ...attachment('three.pdf'), size: 1 },
        ],
      }).success,
    ).toBe(false);
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
