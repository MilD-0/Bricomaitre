import { getDb } from '@bric/db/client';
import { z } from 'zod';

import { bulletinPostSchema, bulletinReplySchema } from './bulletin';
import {
  createBulletinPost,
  createBulletinReply,
  deleteBulletinPost,
  deleteBulletinReply,
  updateBulletinPost,
  type BulletinMutationActor,
} from './bulletin-mutations';

export const adminAiBulletinPostSchema = bulletinPostSchema.omit({ attachments: true }).extend({
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  pinned: z.boolean().default(false),
});

export const adminAiBulletinReplySchema = z.object({
  postId: z.number().int().positive(),
  body: bulletinReplySchema.shape.body,
});

export const adminAiBulletinPostUpdateSchema = z
  .object({
    postId: z.number().int().positive(),
    title: bulletinPostSchema.shape.title.optional(),
    body: bulletinPostSchema.shape.body.optional(),
    tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.body !== undefined ||
      input.tags !== undefined ||
      input.pinned !== undefined,
    { message: 'At least one Bulletin post field must change.' },
  );

export const adminAiBulletinDeleteSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('post'), postId: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('reply'), replyId: z.number().int().positive() }),
]);

export async function createAdminAiBulletinPost(
  input: z.input<typeof adminAiBulletinPostSchema>,
  actor: BulletinMutationActor,
) {
  const values = adminAiBulletinPostSchema.parse(input);
  const created = await createBulletinPost(getDb(), { ...values, attachments: [] }, actor);
  return { ok: true, ...created, title: values.title, tags: values.tags };
}

export async function replyToAdminAiBulletinPost(
  input: z.input<typeof adminAiBulletinReplySchema>,
  actor: BulletinMutationActor,
) {
  const values = adminAiBulletinReplySchema.parse(input);
  const created = await createBulletinReply(getDb(), values.postId, { body: values.body }, actor);
  return { ok: true, ...created };
}

export async function updateAdminAiBulletinPost(
  input: z.input<typeof adminAiBulletinPostUpdateSchema>,
  actor: BulletinMutationActor,
) {
  const { postId, ...changes } = adminAiBulletinPostUpdateSchema.parse(input);
  const updated = await updateBulletinPost(getDb(), postId, changes, actor);
  return { ok: true, ...updated };
}

export async function deleteAdminAiBulletinContent(
  input: z.input<typeof adminAiBulletinDeleteSchema>,
  actor: BulletinMutationActor,
) {
  const target = adminAiBulletinDeleteSchema.parse(input);
  const deleted =
    target.kind === 'post'
      ? await deleteBulletinPost(getDb(), target.postId, actor)
      : await deleteBulletinReply(getDb(), target.replyId, actor);
  return { ok: true, kind: target.kind, ...deleted };
}
