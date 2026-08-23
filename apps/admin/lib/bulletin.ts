import { z } from 'zod';

import { hasPermission, normalizePermissions, type PermissionKey } from './permissions';
import {
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
} from './upload-limits';

const bulletinAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().url(),
  fileKey: z.string().trim().min(1).max(512),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative().max(MAX_BULLETIN_UPLOAD_BYTES),
});

const bulletinAttachmentsSchema = z
  .array(bulletinAttachmentSchema)
  .max(MAX_BULLETIN_UPLOAD_FILES)
  .refine(
    (attachments) =>
      attachments.reduce((total, attachment) => total + attachment.size, 0) <=
      MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
    { message: 'Attachments must be 40 MB or smaller combined' },
  );

const bulletinTitleSchema = z.string().trim().min(3).max(120);
const bulletinBodySchema = z.string().trim().min(10).max(5000);
const bulletinTagsSchema = z
  .array(z.string().trim().min(1).max(24))
  .max(8)
  .transform((tags) => {
    const normalized = tags
      .map((tag) => tag.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((tag) => tag.toLowerCase());

    return Array.from(new Set(normalized));
  });

export const bulletinPostSchema = z.object({
  title: bulletinTitleSchema,
  body: bulletinBodySchema,
  tags: bulletinTagsSchema,
  pinned: z.boolean().optional().default(false),
  attachments: bulletinAttachmentsSchema.default([]),
});

export const bulletinReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const bulletinReplySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const bulletinComposerFormSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
  tagsInput: z.string().max(200),
  pinned: z.boolean(),
  attachments: bulletinAttachmentsSchema,
});

export const bulletinPostPatchSchema = z
  .object({
    title: bulletinTitleSchema.optional(),
    body: bulletinBodySchema.optional(),
    tags: bulletinTagsSchema.optional(),
    pinned: z.boolean().optional(),
    attachments: bulletinAttachmentsSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.tags !== undefined ||
      value.pinned !== undefined ||
      value.attachments !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export type BulletinAttachment = z.infer<typeof bulletinPostSchema>['attachments'][number];

type BulletinActor = {
  id: string | null;
  name: string;
  email: string;
};

export type BulletinReactionRecord = {
  emoji: string;
  count: number;
  reacted: boolean;
  users: BulletinActor[];
};

export type BulletinReplyRecord = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: BulletinActor;
  reactions: BulletinReactionRecord[];
  permissions: {
    canDelete: boolean;
  };
};

export type BulletinComposerFormValues = z.infer<typeof bulletinComposerFormSchema>;

export type BulletinPostRecord = {
  id: number;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  attachments: BulletinAttachment[];
  reactions: BulletinReactionRecord[];
  replies: BulletinReplyRecord[];
  createdAt: string;
  updatedAt: string;
  author: BulletinActor;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canPin: boolean;
  };
};

export function parseBulletinTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function formatBulletinTags(tags: string[]) {
  return tags.join(', ');
}

export function slugifyBulletinTag(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function canModerateBulletin(access: readonly PermissionKey[] | unknown) {
  return hasPermission(normalizePermissions(access), 'bulletin_moderate');
}

export function canDeleteBulletinPost({
  postAuthorId,
  userId,
  permissions,
}: {
  postAuthorId: string | null;
  userId: string | null | undefined;
  permissions: readonly PermissionKey[] | unknown;
}) {
  if (userId && postAuthorId && userId === postAuthorId) {
    return true;
  }

  return canModerateBulletin(permissions);
}

export function canDeleteBulletinReply({
  replyAuthorId,
  userId,
  permissions,
}: {
  replyAuthorId: string | null;
  userId: string | null | undefined;
  permissions: readonly PermissionKey[] | unknown;
}) {
  if (userId && replyAuthorId && userId === replyAuthorId) {
    return true;
  }

  return canModerateBulletin(permissions);
}

export function canEditBulletinPost({
  postAuthorId,
  userId,
  permissions,
}: {
  postAuthorId: string | null;
  userId: string | null | undefined;
  permissions: readonly PermissionKey[] | unknown;
}) {
  if (userId && postAuthorId && userId === postAuthorId) {
    return true;
  }

  return canModerateBulletin(permissions);
}

export function canPinBulletinPost({
  postAuthorId,
  userId,
  permissions,
}: {
  postAuthorId: string | null;
  userId: string | null | undefined;
  permissions: readonly PermissionKey[] | unknown;
}) {
  if (userId && postAuthorId && userId === postAuthorId) {
    return true;
  }

  return canModerateBulletin(permissions);
}
