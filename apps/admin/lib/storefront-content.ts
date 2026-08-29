import { asc } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontAnnouncements } from '@bric/db/schema';

export const storefrontAnnouncementMutationSchema = z
  .object({
    messageFr: z.string().trim().max(300),
    messageAr: z.string().trim().max(300),
    active: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.active || (value.messageFr && value.messageAr)) return;
    context.addIssue({
      code: 'custom',
      message: 'Both announcement messages are required when the bar is active.',
    });
  });

export type StorefrontAnnouncementAdmin = z.infer<typeof storefrontAnnouncementMutationSchema>;

export async function loadStorefrontContentAdmin(): Promise<StorefrontAnnouncementAdmin> {
  if (!hasDb()) return { messageFr: '', messageAr: '', active: false };
  const rows = await getDb()
    .select({
      locale: storefrontAnnouncements.locale,
      message: storefrontAnnouncements.message,
      active: storefrontAnnouncements.active,
    })
    .from(storefrontAnnouncements)
    .orderBy(asc(storefrontAnnouncements.locale));
  return {
    messageFr: rows.find((row) => row.locale === 'fr')?.message ?? '',
    messageAr: rows.find((row) => row.locale === 'ar')?.message ?? '',
    active: rows.some((row) => row.active),
  };
}

export async function saveStorefrontAnnouncement(
  input: StorefrontAnnouncementAdmin,
  actor?: string | null,
) {
  const values = storefrontAnnouncementMutationSchema.parse(input);
  if (values.active && (!values.messageFr || !values.messageAr)) {
    throw new Error('Both announcement messages are required when the bar is active.');
  }
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [locale, message] of [
      ['fr', values.messageFr],
      ['ar', values.messageAr],
    ] as const) {
      await tx
        .insert(storefrontAnnouncements)
        .values({
          locale,
          message,
          active: values.active,
          createdBy: actor ?? null,
          updatedBy: actor ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: storefrontAnnouncements.locale,
          set: { message, active: values.active, updatedBy: actor ?? null, updatedAt: now },
        });
    }
  });
  return values;
}
