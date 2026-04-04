import {
  boolean,
  index,
  integer,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { adminSchema } from './namespaces';

export const bulletinPosts = adminSchema.table(
  'bulletin_posts',
  {
    id: serial('id').primaryKey(),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bulletin_posts_author_id_idx').on(t.authorId),
    index('bulletin_posts_pinned_idx').on(t.pinned),
    index('bulletin_posts_updated_at_idx').on(t.updatedAt),
  ],
);

export const bulletinPostAttachments = adminSchema.table(
  'bulletin_post_attachments',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    fileKey: text('file_key').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bulletin_post_attachments_post_id_idx').on(t.postId),
  ],
);

export const bulletinReplies = adminSchema.table(
  'bulletin_replies',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bulletin_replies_post_id_idx').on(t.postId),
    index('bulletin_replies_author_id_idx').on(t.authorId),
    index('bulletin_replies_created_at_idx').on(t.createdAt),
  ],
);

export const bulletinPostReactions = adminSchema.table(
  'bulletin_post_reactions',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    userName: text('user_name').notNull(),
    userEmail: text('user_email').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bulletin_post_reactions_post_id_idx').on(t.postId),
    uniqueIndex('bulletin_post_reactions_unique').on(t.postId, t.userEmail, t.emoji),
  ],
);

export const bulletinReplyReactions = adminSchema.table(
  'bulletin_reply_reactions',
  {
    id: serial('id').primaryKey(),
    replyId: integer('reply_id')
      .notNull()
      .references(() => bulletinReplies.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    userName: text('user_name').notNull(),
    userEmail: text('user_email').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bulletin_reply_reactions_reply_id_idx').on(t.replyId),
    uniqueIndex('bulletin_reply_reactions_unique').on(t.replyId, t.userEmail, t.emoji),
  ],
);

export const bulletinTags = adminSchema.table(
  'bulletin_tags',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bulletin_tags_name_unique').on(t.name),
    uniqueIndex('bulletin_tags_slug_unique').on(t.slug),
  ],
);

export const bulletinPostTags = adminSchema.table(
  'bulletin_post_tags',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => bulletinTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index('bulletin_post_tags_post_id_idx').on(t.postId),
    index('bulletin_post_tags_tag_id_idx').on(t.tagId),
  ],
);
