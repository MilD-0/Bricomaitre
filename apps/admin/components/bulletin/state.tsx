'use client';
import { useQueryClient } from '@tanstack/react-query';
import {
  bulletinAttachmentSchema,
  type BulletinAttachment,
  type BulletinComposerFormValues,
  type BulletinPagination,
  type BulletinPostRecord,
  type BulletinReactionRecord,
} from '../../lib/bulletin';

export type BulletinResponse = {
  posts: BulletinPostRecord[];
  availableTags: string[];
  currentUserId: string | null;
  permissions: {
    canModerate: boolean;
    canPost: boolean;
  };
  pagination: BulletinPagination;
};

type MutationMessages = {
  loading: string;
  success: string;
  error: string;
};

export type PostReactionVariables = { postId: number; emoji: string; messages: MutationMessages };

export type ReplyCreateVariables = { postId: number; body: string; messages: MutationMessages };

export type ReplyDeleteVariables = { replyId: number; messages: MutationMessages };

export type ReplyReactionVariables = { replyId: number; emoji: string; messages: MutationMessages };

const draftStorageKey = 'bulletin-board-draft-v3';

export const pageSize = 20;

let nextOptimisticId = -1;

export function takeOptimisticId() {
  const id = nextOptimisticId;
  nextOptimisticId -= 1;
  return id;
}

export const reactionOptions = ['👍', '❤️', '👏', '🎉', '🔥', '👀'];

export const defaultValues: BulletinComposerFormValues = {
  title: '',
  body: '',
  tagsInput: '',
  pinned: false,
  attachments: [],
};

export function normalizeAttachments(value: unknown): BulletinAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((attachment) => {
    const parsed = bulletinAttachmentSchema.safeParse(attachment);
    return parsed.success ? [parsed.data] : [];
  });
}

export function readDraft() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BulletinComposerFormValues> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      tagsInput: typeof parsed.tagsInput === 'string' ? parsed.tagsInput : '',
      pinned: parsed.pinned === true,
      attachments: normalizeAttachments(parsed.attachments),
    };
  } catch {
    return null;
  }
}

export function writeDraft(value: BulletinComposerFormValues | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value) window.localStorage.setItem(draftStorageKey, JSON.stringify(value));
    else window.localStorage.removeItem(draftStorageKey);
  } catch {
    // Storage can be blocked or full; the in-memory composer remains usable.
  }
}

export function hasDraftContent(value: BulletinComposerFormValues) {
  return (
    value.title.trim().length > 0 ||
    value.body.trim().length > 0 ||
    value.tagsInput.trim().length > 0 ||
    value.attachments.length > 0
  );
}

export function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function toggleReaction(
  reactions: BulletinReactionRecord[],
  emoji: string,
  user: BulletinReactionRecord['users'][number],
) {
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (!existing) return [...reactions, { emoji, count: 1, reacted: true, users: [user] }];
  return reactions
    .map((reaction) =>
      reaction === existing
        ? {
            ...reaction,
            reacted: !reaction.reacted,
            count: Math.max(0, reaction.count + (reaction.reacted ? -1 : 1)),
            users: reaction.reacted
              ? reaction.users.filter((actor) => actor.id !== user.id)
              : [...reaction.users, user],
          }
        : reaction,
    )
    .filter((reaction) => reaction.count > 0);
}

export function updateBulletinBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly ['bulletin-board', number, string, string],
  updater: (current: BulletinResponse) => BulletinResponse,
) {
  queryClient.setQueryData<BulletinResponse>(queryKey, (current) => {
    if (!current) {
      return current;
    }

    return updater(current);
  });
}
