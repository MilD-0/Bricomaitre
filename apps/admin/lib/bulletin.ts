import { z } from 'zod';

import { hasPermission, normalizePermissions } from './permissions';
import {
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
} from './upload-limits';

export const bulletinAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z
    .string()
    .trim()
    .refine(
      (value) => value.startsWith('/api/bulletin/attachments/') || z.url().safeParse(value).success,
      'Attachment URL is invalid',
    ),
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

export const bulletinListQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  limit: z.coerce.number().int().positive().max(50).catch(20),
  tag: z.string().trim().max(24).catch('all'),
  sort: z.enum(['updated-desc', 'updated-asc', 'created-desc']).catch('updated-desc'),
});

export type BulletinListQuery = z.infer<typeof bulletinListQuerySchema>;

export type BulletinPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export const bulletinComposerFormSchema = z.object({
  title: bulletinTitleSchema,
  body: bulletinBodySchema,
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

export function canModerateBulletin(access: unknown) {
  return hasPermission(normalizePermissions(access), 'bulletin_moderate');
}

export function canManageBulletinContent({
  authorId,
  userId,
  permissions,
}: {
  authorId: string | null;
  userId: string | null | undefined;
  permissions: unknown;
}) {
  return Boolean(userId && authorId && userId === authorId) || canModerateBulletin(permissions);
}
