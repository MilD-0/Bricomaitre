'use client';

/* eslint-disable @next/next/no-img-element -- Bulletin attachments are user-uploaded preview content, including non-Next-managed origins. */

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Pin,
  RefreshCcw,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  type BulletinAttachment,
  type BulletinComposerFormValues,
  type BulletinPostRecord,
  type BulletinReactionRecord,
  type BulletinReplyRecord,
  bulletinComposerFormSchema,
  bulletinPostSchema,
  formatBulletinTags,
  parseBulletinTags,
} from '../lib/bulletin';
import { requestJson as request } from '../lib/admin-api';
import { bulletinAiSurfaceDetails } from '../lib/admin-ai-live-surface-details';
import { toast } from '../lib/toast';
import { AdminAiAskButton } from './admin-ai-ask-button';
import { Badge } from './ui/badge';
import { useAdminAiSurfaceDetails } from './admin-ai-surface-context';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { CompactMenu, CompactMenuItem } from './ui/compact-menu';
import { WorkspacePagination } from './ui/workspace-pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Field, FieldContent, FieldLabel } from './ui/field';
import { FileUploadField } from './file-upload-field';
import { Input } from './ui/input';
import { Markdown } from './ui/markdown';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Textarea } from './ui/textarea';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from './ui/workspace';

type BulletinResponse = {
  posts: BulletinPostRecord[];
  availableTags: string[];
  currentUserId: string | null;
  permissions: {
    canModerate: boolean;
    canPost: boolean;
  };
};

type MutationMessages = {
  loading: string;
  success: string;
  error: string;
};

type PostReactionVariables = { postId: number; emoji: string; messages: MutationMessages };
type ReplyCreateVariables = { postId: number; body: string; messages: MutationMessages };
type ReplyDeleteVariables = { replyId: number; messages: MutationMessages };
type ReplyReactionVariables = { replyId: number; emoji: string; messages: MutationMessages };

const draftStorageKey = 'bulletin-board-draft-v3';
const pageSize = 20;
let nextOptimisticId = -1;

function takeOptimisticId() {
  const id = nextOptimisticId;
  nextOptimisticId -= 1;
  return id;
}
const reactionOptions = ['👍', '❤️', '👏', '🎉', '🔥', '👀'];

const defaultValues: BulletinComposerFormValues = {
  title: '',
  body: '',
  tagsInput: '',
  pinned: false,
  attachments: [],
};

function normalizeAttachments(value: unknown): BulletinAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((attachment): BulletinAttachment[] => {
    if (
      attachment &&
      typeof attachment === 'object' &&
      typeof attachment.fileName === 'string' &&
      typeof attachment.fileUrl === 'string' &&
      typeof attachment.fileKey === 'string' &&
      typeof attachment.contentType === 'string' &&
      typeof attachment.size === 'number'
    ) {
      return [
        {
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileKey: attachment.fileKey,
          contentType: attachment.contentType,
          size: attachment.size,
        },
      ];
    }

    return [];
  });
}

function readDraft() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(draftStorageKey);
  if (!raw) {
    return null;
  }

  try {
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

function writeDraft(value: BulletinComposerFormValues | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!value) {
    window.localStorage.removeItem(draftStorageKey);
    return;
  }

  window.localStorage.setItem(draftStorageKey, JSON.stringify(value));
}

function hasDraftContent(value: BulletinComposerFormValues) {
  return (
    value.title.trim().length > 0 ||
    value.body.trim().length > 0 ||
    value.tagsInput.trim().length > 0 ||
    value.attachments.length > 0
  );
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function updateBulletinBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (current: BulletinResponse) => BulletinResponse,
) {
  queryClient.setQueryData<BulletinResponse>(['bulletin-board'], (current) => {
    if (!current) {
      return current;
    }

    return updater(current);
  });
}

export function BulletinBoard() {
  const t = useTranslations('bulletinBoard');
  const labelsT = useTranslations('labels');
  const queryClient = useQueryClient();
  const loadingToastIdRef = useRef<string | null>(null);
  const [editingPost, setEditingPost] = useState<BulletinPostRecord | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [sort, setSort] = useState<'updated-desc' | 'updated-asc' | 'created-desc'>('updated-desc');
  const [page, setPage] = useState(1);
  const [deletePost, setDeletePost] = useState<BulletinPostRecord | null>(null);

  const boardQuery = useQuery({
    queryKey: ['bulletin-board'],
    queryFn: () => request<BulletinResponse>('/api/bulletin'),
    initialData: {
      posts: [],
      availableTags: [],
      currentUserId: null,
      permissions: { canModerate: false, canPost: true },
    },
  });

  const form = useForm<BulletinComposerFormValues>({
    resolver: zodResolver(bulletinComposerFormSchema),
    defaultValues,
  });
  const draftValues = useWatch({ control: form.control });

  useEffect(() => {
    const draft = readDraft();
    if (draft && hasDraftContent(draft)) {
      form.reset(draft);
      queueMicrotask(() => setComposerOpen(true));
    }
  }, [form]);

  useEffect(() => {
    if (editingPost) {
      return;
    }

    const values: BulletinComposerFormValues = {
      title: draftValues.title ?? '',
      body: draftValues.body ?? '',
      tagsInput: draftValues.tagsInput ?? '',
      pinned: draftValues.pinned ?? false,
      attachments: normalizeAttachments(draftValues.attachments),
    };

    if (composerOpen && hasDraftContent(values)) {
      writeDraft(values);
      return;
    }

    writeDraft(null);
  }, [
    composerOpen,
    draftValues.attachments,
    draftValues.body,
    draftValues.pinned,
    draftValues.tagsInput,
    draftValues.title,
    editingPost,
  ]);

  useEffect(() => {
    if (boardQuery.isLoading || (boardQuery.isFetching && boardQuery.data.posts.length === 0)) {
      if (!loadingToastIdRef.current) {
        loadingToastIdRef.current = toast.loading(t('feedback.loading'));
      }
      return;
    }

    if (loadingToastIdRef.current) {
      toast.dismiss(loadingToastIdRef.current);
      loadingToastIdRef.current = null;
    }
  }, [boardQuery.data.posts.length, boardQuery.isFetching, boardQuery.isLoading, t]);

  useEffect(() => {
    if (boardQuery.isError) {
      toast.error(t('feedback.loadError'));
    }
  }, [boardQuery.isError, t]);

  const refreshBoard = () => queryClient.invalidateQueries({ queryKey: ['bulletin-board'] });
  const currentUserId = boardQuery.data.currentUserId;
  const currentUserName = t('post.byYou');

  const createMutation = useMutation({
    mutationFn: (values: BulletinComposerFormValues) =>
      request('/api/bulletin', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          tags: parseBulletinTags(values.tagsInput),
        }),
      }),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(['bulletin-board']);
      const now = new Date().toISOString();
      const tempId = takeOptimisticId();

      updateBulletinBoard(queryClient, (current) => ({
        ...current,
        posts: [
          {
            id: tempId,
            title: values.title,
            body: values.body,
            tags: parseBulletinTags(values.tagsInput),
            attachments: values.attachments,
            reactions: [],
            replies: [],
            pinned: values.pinned,
            createdAt: now,
            updatedAt: now,
            author: {
              id: currentUserId,
              name: currentUserName,
              email: '',
            },
            permissions: {
              canEdit: true,
              canDelete: true,
              canPin: true,
            },
          },
          ...current.posts,
        ],
      }));

      cancelComposer();
      writeDraft(null);

      return {
        snapshot,
        values,
        toastId: toast.loading(t('notifications.create.loading', { title: values.title })),
      };
    },
    onError: (_error, _values, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bulletin-board'], context.snapshot);
      }
      if (context?.values) {
        form.reset(context.values);
        setComposerOpen(true);
        writeDraft(context.values);
      }
      toast.error(t('notifications.create.error'), { id: context?.toastId });
    },
    onSuccess: async (_data, values, context) => {
      toast.success(t('notifications.create.success', { title: values.title }), {
        id: context?.toastId,
      });
      await refreshBoard();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: BulletinComposerFormValues }) =>
      request(`/api/bulletin/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...values,
          tags: parseBulletinTags(values.tagsInput),
        }),
      }),
    onMutate: ({ values }) => ({
      toastId: toast.loading(t('notifications.update.loading', { title: values.title })),
    }),
    onError: (_error, _values, context) => {
      toast.error(t('notifications.update.error'), { id: context?.toastId });
    },
    onSuccess: async (_data, { values }, context) => {
      toast.success(t('notifications.update.success', { title: values.title }), {
        id: context?.toastId,
      });
      await refreshBoard();
      cancelComposer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => request(`/api/bulletin/${id}`, { method: 'DELETE' }),
    onMutate: () => ({ toastId: toast.loading(t('notifications.delete.loading')) }),
    onError: (_error, _id, context) => {
      toast.error(t('notifications.delete.error'), { id: context?.toastId });
    },
    onSuccess: async (_data, _id, context) => {
      toast.success(t('notifications.delete.success'), { id: context?.toastId });
      await refreshBoard();
      setDeletePost(null);
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      request(`/api/bulletin/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned }),
      }),
    onMutate: ({ pinned }) => ({
      toastId: toast.loading(
        t(pinned ? 'notifications.pin.loading' : 'notifications.unpin.loading'),
      ),
    }),
    onError: (_error, variables, context) => {
      toast.error(t(variables.pinned ? 'notifications.pin.error' : 'notifications.unpin.error'), {
        id: context?.toastId,
      });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(
        t(variables.pinned ? 'notifications.pin.success' : 'notifications.unpin.success'),
        { id: context?.toastId },
      );
      await refreshBoard();
    },
  });

  const postReactionMutation = useMutation({
    mutationFn: ({ postId, emoji }: PostReactionVariables) =>
      request(`/api/bulletin/${postId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onMutate: async ({ postId, emoji, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(['bulletin-board']);

      updateBulletinBoard(queryClient, (current) => ({
        ...current,
        posts: current.posts.map((post) => {
          if (post.id !== postId) {
            return post;
          }

          const existing = post.reactions.find((reaction) => reaction.emoji === emoji);
          const alreadyReacted = existing?.reacted ?? false;
          let nextReactions = post.reactions.map((reaction) =>
            reaction.emoji === emoji
              ? {
                  ...reaction,
                  count: Math.max(0, reaction.count + (alreadyReacted ? -1 : 1)),
                  reacted: !alreadyReacted,
                  users: alreadyReacted
                    ? reaction.users.filter((user) => user.id !== currentUserId)
                    : [...reaction.users, { id: currentUserId, name: currentUserName, email: '' }],
                }
              : reaction,
          );

          if (!existing) {
            nextReactions = [
              ...nextReactions,
              {
                emoji,
                count: 1,
                reacted: true,
                users: [{ id: currentUserId, name: currentUserName, email: '' }],
              },
            ];
          }

          nextReactions = nextReactions.filter((reaction) => reaction.count > 0);

          return {
            ...post,
            reactions: nextReactions,
          };
        }),
      }));

      return { snapshot, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bulletin-board'], context.snapshot);
      }
      toast.error(variables.messages.error, { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(variables.messages.success, { id: context?.toastId });
      await refreshBoard();
    },
  });

  const replyCreateMutation = useMutation({
    mutationFn: ({ postId, body }: ReplyCreateVariables) =>
      request(`/api/bulletin/${postId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onMutate: async ({ postId, body, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(['bulletin-board']);
      const now = new Date().toISOString();

      updateBulletinBoard(queryClient, (current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                updatedAt: now,
                replies: [
                  ...post.replies,
                  {
                    id: takeOptimisticId(),
                    body,
                    createdAt: now,
                    updatedAt: now,
                    author: {
                      id: currentUserId,
                      name: currentUserName,
                      email: '',
                    },
                    reactions: [],
                    permissions: {
                      canDelete: true,
                    },
                  },
                ],
              }
            : post,
        ),
      }));

      return { snapshot, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bulletin-board'], context.snapshot);
      }
      toast.error(variables.messages.error, { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(variables.messages.success, { id: context?.toastId });
      await refreshBoard();
    },
  });

  const replyDeleteMutation = useMutation({
    mutationFn: ({ replyId }: ReplyDeleteVariables) =>
      request(`/api/bulletin/replies/${replyId}`, { method: 'DELETE' }),
    onMutate: async ({ messages }) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(['bulletin-board']);
      return { snapshot, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bulletin-board'], context.snapshot);
      }
      toast.error(variables.messages.error, { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(variables.messages.success, { id: context?.toastId });
      await refreshBoard();
    },
  });

  const replyReactionMutation = useMutation({
    mutationFn: ({ replyId, emoji }: ReplyReactionVariables) =>
      request(`/api/bulletin/replies/${replyId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onMutate: async ({ replyId, emoji, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(['bulletin-board']);

      updateBulletinBoard(queryClient, (current) => ({
        ...current,
        posts: current.posts.map((post) => ({
          ...post,
          replies: post.replies.map((reply) => {
            if (reply.id !== replyId) {
              return reply;
            }

            const existing = reply.reactions.find((reaction) => reaction.emoji === emoji);
            const alreadyReacted = existing?.reacted ?? false;
            let nextReactions = reply.reactions.map((reaction) =>
              reaction.emoji === emoji
                ? {
                    ...reaction,
                    count: Math.max(0, reaction.count + (alreadyReacted ? -1 : 1)),
                    reacted: !alreadyReacted,
                    users: alreadyReacted
                      ? reaction.users.filter((user) => user.id !== currentUserId)
                      : [
                          ...reaction.users,
                          { id: currentUserId, name: currentUserName, email: '' },
                        ],
                  }
                : reaction,
            );

            if (!existing) {
              nextReactions = [
                ...nextReactions,
                {
                  emoji,
                  count: 1,
                  reacted: true,
                  users: [{ id: currentUserId, name: currentUserName, email: '' }],
                },
              ];
            }

            nextReactions = nextReactions.filter((reaction) => reaction.count > 0);

            return {
              ...reply,
              reactions: nextReactions,
            };
          }),
        })),
      }));

      return { snapshot, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bulletin-board'], context.snapshot);
      }
      toast.error(variables.messages.error, { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(variables.messages.success, { id: context?.toastId });
      await refreshBoard();
    },
  });

  function cancelComposer() {
    setEditingPost(null);
    setComposerOpen(false);
    form.reset(defaultValues);
  }

  function openComposer() {
    setEditingPost(null);
    setComposerOpen(true);
    form.reset(readDraft() ?? defaultValues);
  }

  const sortedPosts = useMemo(() => {
    const filtered = boardQuery.data.posts
      .map((post) => ({
        ...post,
        reactions: post.reactions ?? [],
        replies: (post.replies ?? []).map((reply) => ({
          ...reply,
          reactions: reply.reactions ?? [],
        })),
      }))
      .filter((post) => activeTag === 'all' || post.tags.includes(activeTag));
    const next = [...filtered];

    next.sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }

      if (sort === 'updated-asc') {
        return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      }

      if (sort === 'created-desc') {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

    return next;
  }, [activeTag, boardQuery.data.posts, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagePosts = sortedPosts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pinnedPosts = pagePosts.filter((post) => post.pinned);
  const recentPosts = pagePosts.filter((post) => !post.pinned);
  useAdminAiSurfaceDetails(
    bulletinAiSurfaceDetails({
      activeTag,
      sort,
      page: currentPage,
      visibleCount: pagePosts.length,
      totalPosts: boardQuery.data.posts.length,
      composerOpen,
      focusedPostId: editingPost?.id ?? deletePost?.id ?? null,
      fetching: boardQuery.isFetching,
    }),
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      title: values.title,
      body: values.body,
      tags: parseBulletinTags(values.tagsInput),
      pinned: values.pinned,
      attachments: values.attachments,
    };

    const parsed = bulletinPostSchema.safeParse(payload);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const path = issue.path[0];
        if (path === 'title' || path === 'body') {
          form.setError(path, { message: issue.message });
        }
        if (path === 'tags') {
          form.setError('tagsInput', { message: issue.message });
        }
        if (path === 'attachments') {
          form.setError('attachments', { message: issue.message });
        }
      });
      toast.error(t('notifications.validation'));
      return;
    }

    if (editingPost) {
      await updateMutation.mutateAsync({ id: editingPost.id, values });
      return;
    }

    await createMutation.mutateAsync(values);
  });

  const allTags = ['all', ...boardQuery.data.availableTags];
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    pinMutation.isPending ||
    postReactionMutation.isPending ||
    replyCreateMutation.isPending ||
    replyDeleteMutation.isPending ||
    replyReactionMutation.isPending;

  return (
    <WorkspaceFrame className="overflow-hidden" data-admin-workspace="bulletin">
      <WorkspaceHeader>
        <WorkspaceHeading
          title={t('title')}
          meta={t('sections.visibleCount', { count: boardQuery.data.posts.length })}
          description={
            boardQuery.isFetching ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t('feedback.refreshing')}
              </span>
            ) : null
          }
        />
        <WorkspaceActions>
          <AdminAiAskButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshBoard()}
            disabled={boardQuery.isFetching}
          >
            <RefreshCcw
              data-icon="inline-start"
              className={boardQuery.isFetching ? 'animate-spin' : ''}
            />
            {t('actions.refresh')}
          </Button>
          <Button
            type="button"
            onClick={composerOpen && !editingPost ? cancelComposer : openComposer}
            disabled={!boardQuery.data.permissions.canPost}
          >
            <MessageSquarePlus data-icon="inline-start" />
            {composerOpen && !editingPost ? t('actions.closeComposer') : t('actions.openComposer')}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>

      <WorkspaceToolbar className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {allTags.map((tag) => {
            const active = tag === activeTag;
            return (
              <Button
                key={tag}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setActiveTag(tag);
                  setPage(1);
                }}
              >
                {tag === 'all' ? t('filters.allTags') : tag}
              </Button>
            );
          })}
        </div>

        <NativeSelect
          className="lg:w-56 lg:shrink-0"
          aria-label={t('filters.sortLabel')}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
        >
          <NativeSelectOption value="updated-desc">
            {t('filters.sortUpdatedDesc')}
          </NativeSelectOption>
          <NativeSelectOption value="updated-asc">{t('filters.sortUpdatedAsc')}</NativeSelectOption>
          <NativeSelectOption value="created-desc">
            {t('filters.sortCreatedDesc')}
          </NativeSelectOption>
        </NativeSelect>
      </WorkspaceToolbar>

      {composerOpen || editingPost ? (
        <section className="border-b border-border/60 px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {editingPost ? t('composer.editTitle') : t('composer.createTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {editingPost ? t('composer.editDescription') : t('composer.createDescription')}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={cancelComposer}>
              <X />
            </Button>
          </div>

          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Field data-invalid={Boolean(form.formState.errors.title)}>
              <FieldLabel htmlFor="bulletin-title">{t('composer.titleLabel')}</FieldLabel>
              <Input
                id="bulletin-title"
                aria-invalid={Boolean(form.formState.errors.title)}
                placeholder={t('composer.titlePlaceholder')}
                {...form.register('title')}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.body)}>
              <FieldLabel htmlFor="bulletin-body">{t('composer.bodyLabel')}</FieldLabel>
              <Textarea
                id="bulletin-body"
                aria-invalid={Boolean(form.formState.errors.body)}
                placeholder={t('composer.bodyPlaceholder')}
                {...form.register('body')}
              />
              {form.formState.errors.body ? (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.tagsInput)}>
              <FieldLabel htmlFor="bulletin-tags">{t('composer.tagsLabel')}</FieldLabel>
              <Input
                id="bulletin-tags"
                aria-invalid={Boolean(form.formState.errors.tagsInput)}
                placeholder={t('composer.tagsPlaceholder')}
                {...form.register('tagsInput')}
              />
              {form.formState.errors.tagsInput ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.tagsInput.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('composer.tagsHint')}</p>
              )}
            </Field>

            <FileUploadField
              uploadUrl="/api/uploads/bulletin"
              label={t('composer.attachmentsLabel')}
              hint={t('composer.attachmentsHint')}
              value={normalizeAttachments(draftValues.attachments)}
              onChange={(files) =>
                form.setValue('attachments', files, { shouldDirty: true, shouldValidate: true })
              }
            />
            {form.formState.errors.attachments ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.attachments.message}
              </p>
            ) : null}

            <Field
              orientation="horizontal"
              className="border-y border-border/60 py-3 text-sm text-foreground"
            >
              <Checkbox
                id="bulletin-pinned"
                {...form.register('pinned')}
                disabled={
                  !boardQuery.data.permissions.canModerate && !editingPost?.permissions.canPin
                }
              />
              <FieldContent>
                <FieldLabel htmlFor="bulletin-pinned">{t('composer.pinLabel')}</FieldLabel>
              </FieldContent>
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !boardQuery.data.permissions.canPost}>
                {createMutation.isPending || updateMutation.isPending ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SquarePen data-icon="inline-start" />
                )}
                {editingPost ? t('actions.update') : t('actions.post')}
              </Button>
              <Button type="button" variant="outline" onClick={cancelComposer}>
                {t('actions.cancel')}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {boardQuery.isLoading && boardQuery.data.posts.length === 0 ? (
        <div className="border-b border-border/60 px-3 py-8 sm:px-4 lg:px-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t('feedback.loading')}
          </div>
        </div>
      ) : null}

      {boardQuery.isError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-6 sm:px-4 lg:px-5">
          <p className="text-sm font-medium text-foreground">{t('feedback.loadError')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('feedback.retryHint')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void refreshBoard()}
          >
            {t('actions.refresh')}
          </Button>
        </div>
      ) : null}

      <div>
        {pinnedPosts.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:px-4 lg:px-5">
              <Pin className="text-amber-600" />
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('sections.pinned')}
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {pinnedPosts.map((post) => (
                <BulletinPostCard
                  key={post.id}
                  post={post}
                  currentUserId={boardQuery.data.currentUserId}
                  busy={busy}
                  reactionOptions={reactionOptions}
                  labels={{
                    actions: labelsT('actions'),
                    delete: t('actions.delete'),
                    edit: t('actions.edit'),
                    unpin: t('actions.unpin'),
                    pin: t('actions.pin'),
                    pinned: t('post.pinned'),
                    byYou: t('post.byYou'),
                    updated: t('post.updated'),
                    refreshReply: t('actions.reply'),
                    sendReply: t('actions.sendReply'),
                    cancel: t('actions.cancel'),
                    addReaction: t('actions.addReaction'),
                    deleteReply: t('actions.deleteReply'),
                    replyPlaceholder: t('reply.placeholder'),
                    reactionsBy: t('reactions.by'),
                    replies: t('reply.title', { count: post.replies.length }),
                  }}
                  onDelete={() => setDeletePost(post)}
                  onEdit={() => {
                    setEditingPost(post);
                    setComposerOpen(true);
                    form.reset({
                      title: post.title,
                      body: post.body,
                      tagsInput: formatBulletinTags(post.tags),
                      pinned: post.pinned,
                      attachments: post.attachments,
                    });
                  }}
                  onTogglePin={() => pinMutation.mutate({ id: post.id, pinned: !post.pinned })}
                  onReact={(emoji) =>
                    postReactionMutation.mutate({
                      postId: post.id,
                      emoji,
                      messages: {
                        loading: t('notifications.react.loading', { emoji, title: post.title }),
                        success: t('notifications.react.success', { emoji, title: post.title }),
                        error: t('notifications.react.error', { emoji, title: post.title }),
                      },
                    })
                  }
                  onReply={(body) =>
                    replyCreateMutation.mutate({
                      postId: post.id,
                      body,
                      messages: {
                        loading: t('notifications.reply.loading', { title: post.title }),
                        success: t('notifications.reply.success', { title: post.title }),
                        error: t('notifications.reply.error', { title: post.title }),
                      },
                    })
                  }
                  onDeleteReply={(reply) =>
                    replyDeleteMutation.mutate({
                      replyId: reply.id,
                      messages: {
                        loading: t('notifications.replyDelete.loading'),
                        success: t('notifications.replyDelete.success'),
                        error: t('notifications.replyDelete.error'),
                      },
                    })
                  }
                  onReplyReact={(reply, emoji) =>
                    replyReactionMutation.mutate({
                      replyId: reply.id,
                      emoji,
                      messages: {
                        loading: t('notifications.replyReact.loading', { emoji }),
                        success: t('notifications.replyReact.success', { emoji }),
                        error: t('notifications.replyReact.error', { emoji }),
                      },
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:px-4 lg:px-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('sections.recent')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('sections.visibleCount', { count: sortedPosts.length })}
            </p>
          </div>

          {pagePosts.length === 0 ? (
            <div className="border-b border-border/60 px-3 py-10 sm:px-4 lg:px-5">
              <p className="text-sm font-medium text-foreground">{t('empty.title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('empty.description')}</p>
            </div>
          ) : null}

          <div className="divide-y divide-border/60">
            {recentPosts.map((post) => (
              <BulletinPostCard
                key={post.id}
                post={post}
                currentUserId={boardQuery.data.currentUserId}
                busy={busy}
                reactionOptions={reactionOptions}
                labels={{
                  actions: labelsT('actions'),
                  delete: t('actions.delete'),
                  edit: t('actions.edit'),
                  unpin: t('actions.unpin'),
                  pin: t('actions.pin'),
                  pinned: t('post.pinned'),
                  byYou: t('post.byYou'),
                  updated: t('post.updated'),
                  refreshReply: t('actions.reply'),
                  sendReply: t('actions.sendReply'),
                  cancel: t('actions.cancel'),
                  addReaction: t('actions.addReaction'),
                  deleteReply: t('actions.deleteReply'),
                  replyPlaceholder: t('reply.placeholder'),
                  reactionsBy: t('reactions.by'),
                  replies: t('reply.title', { count: post.replies.length }),
                }}
                onDelete={() => setDeletePost(post)}
                onEdit={() => {
                  setEditingPost(post);
                  setComposerOpen(true);
                  form.reset({
                    title: post.title,
                    body: post.body,
                    tagsInput: formatBulletinTags(post.tags),
                    pinned: post.pinned,
                    attachments: post.attachments,
                  });
                }}
                onTogglePin={() => pinMutation.mutate({ id: post.id, pinned: !post.pinned })}
                onReact={(emoji) =>
                  postReactionMutation.mutate({
                    postId: post.id,
                    emoji,
                    messages: {
                      loading: t('notifications.react.loading', { emoji, title: post.title }),
                      success: t('notifications.react.success', { emoji, title: post.title }),
                      error: t('notifications.react.error', { emoji, title: post.title }),
                    },
                  })
                }
                onReply={(body) =>
                  replyCreateMutation.mutate({
                    postId: post.id,
                    body,
                    messages: {
                      loading: t('notifications.reply.loading', { title: post.title }),
                      success: t('notifications.reply.success', { title: post.title }),
                      error: t('notifications.reply.error', { title: post.title }),
                    },
                  })
                }
                onDeleteReply={(reply) =>
                  replyDeleteMutation.mutate({
                    replyId: reply.id,
                    messages: {
                      loading: t('notifications.replyDelete.loading'),
                      success: t('notifications.replyDelete.success'),
                      error: t('notifications.replyDelete.error'),
                    },
                  })
                }
                onReplyReact={(reply, emoji) =>
                  replyReactionMutation.mutate({
                    replyId: reply.id,
                    emoji,
                    messages: {
                      loading: t('notifications.replyReact.loading', { emoji }),
                      success: t('notifications.replyReact.success', { emoji }),
                      error: t('notifications.replyReact.error', { emoji }),
                    },
                  })
                }
              />
            ))}
          </div>
        </section>

        <WorkspacePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pending={boardQuery.isFetching}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={deletePost !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePost(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete.title')}</DialogTitle>
            <DialogDescription>
              {t('delete.description', { title: deletePost?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletePost(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletePost && deleteMutation.mutate(deletePost.id)}
            >
              {deleteMutation.isPending ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : null}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}

function ReactionRow({
  currentUserId,
  reactions,
  options,
  busy,
  onReact,
  addReactionLabel,
  byLabel,
  byYouLabel,
}: {
  currentUserId: string | null;
  reactions: BulletinReactionRecord[];
  options: string[];
  busy: boolean;
  onReact: (emoji: string) => void;
  addReactionLabel: string;
  byLabel: string;
  byYouLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {addReactionLabel}
        </span>
        {options.map((emoji) => {
          const existing = reactions.find((reaction) => reaction.emoji === emoji);
          return (
            <Button
              key={emoji}
              type="button"
              variant={existing?.reacted ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              disabled={busy}
              onClick={() => onReact(emoji)}
            >
              <span>{emoji}</span>
              {existing ? <span>{existing.count}</span> : null}
            </Button>
          );
        })}
      </div>

      {reactions.length > 0 ? (
        <div className="flex flex-col gap-1">
          {reactions.map((reaction) => (
            <p key={reaction.emoji} className="text-xs text-muted-foreground">
              {reaction.emoji} {byLabel}:{' '}
              {reaction.users
                .map((user) =>
                  currentUserId !== null && user.id === currentUserId ? byYouLabel : user.name,
                )
                .join(', ')}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BulletinPostCard({
  post,
  currentUserId,
  busy,
  reactionOptions,
  labels,
  onEdit,
  onDelete,
  onTogglePin,
  onReact,
  onReply,
  onDeleteReply,
  onReplyReact,
}: {
  post: BulletinPostRecord;
  currentUserId: string | null;
  busy: boolean;
  reactionOptions: string[];
  labels: {
    actions: string;
    delete: string;
    edit: string;
    pin: string;
    unpin: string;
    pinned: string;
    byYou: string;
    updated: string;
    refreshReply: string;
    sendReply: string;
    cancel: string;
    addReaction: string;
    deleteReply: string;
    replyPlaceholder: string;
    reactionsBy: string;
    replies: string;
  };
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onReact: (emoji: string) => void;
  onReply: (body: string) => void;
  onDeleteReply: (reply: BulletinReplyRecord) => void;
  onReplyReact: (reply: BulletinReplyRecord, emoji: string) => void;
}) {
  const isAuthor = currentUserId !== null && post.author.id === currentUserId;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [deleteReply, setDeleteReply] = useState<BulletinReplyRecord | null>(null);

  return (
    <article
      className={`mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 lg:px-5 ${post.pinned ? 'bg-amber-500/[0.035]' : ''}`}
      data-bulletin-post={post.id}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{post.title}</h3>
            {post.pinned ? <Badge variant="outline">{labels.pinned}</Badge> : null}
            {isAuthor ? <Badge>{labels.byYou}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {post.author.name} · {labels.updated}: {new Date(post.updatedAt).toLocaleString()}
          </p>
        </div>

        {post.permissions.canPin || post.permissions.canEdit || post.permissions.canDelete ? (
          <CompactMenu label={`${labels.actions} · ${post.title}`}>
            {post.permissions.canPin ? (
              <CompactMenuItem disabled={busy} onClick={onTogglePin}>
                {post.pinned ? labels.unpin : labels.pin}
              </CompactMenuItem>
            ) : null}
            {post.permissions.canEdit ? (
              <CompactMenuItem disabled={busy} onClick={onEdit}>
                {labels.edit}
              </CompactMenuItem>
            ) : null}
            {post.permissions.canDelete ? (
              <CompactMenuItem destructive disabled={busy} onClick={onDelete}>
                {labels.delete}
              </CompactMenuItem>
            ) : null}
          </CompactMenu>
        ) : null}
      </div>

      <Markdown className="mt-4">{post.body}</Markdown>

      {post.attachments.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {post.attachments.map((attachment) => (
            <a
              key={`${post.id}-${attachment.fileUrl}`}
              href={attachment.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="border-y border-border/60 px-1 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-3">
                {attachment.contentType.startsWith('image/') ? (
                  <img
                    src={attachment.fileUrl}
                    alt={attachment.fileName}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-muted-foreground">
                    <FileText className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAttachmentSize(attachment.size)}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <Badge key={`${post.id}-${tag}`} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-4">
        <ReactionRow
          currentUserId={currentUserId}
          reactions={post.reactions}
          options={reactionOptions}
          busy={busy}
          onReact={onReact}
          addReactionLabel={labels.addReaction}
          byLabel={labels.reactionsBy}
          byYouLabel={labels.byYou}
        />
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">{labels.replies}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setReplyOpen((value) => !value)}
          >
            {labels.refreshReply}
          </Button>
        </div>

        {replyOpen ? (
          <div className="mt-3 flex flex-col gap-3 border-y border-border/60 py-3">
            <Textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder={labels.replyPlaceholder}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || replyBody.trim().length === 0}
                onClick={() => {
                  void onReply(replyBody.trim());
                  setReplyBody('');
                  setReplyOpen(false);
                }}
              >
                {labels.sendReply}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setReplyOpen(false)}>
                {labels.cancel}
              </Button>
            </div>
          </div>
        ) : null}

        {post.replies.length > 0 ? (
          <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
            {post.replies.map((reply) => (
              <div key={reply.id} className="py-3" data-bulletin-reply={reply.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {currentUserId !== null && reply.author.id === currentUserId
                        ? labels.byYou
                        : reply.author.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(reply.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {reply.permissions.canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeleteReply(reply)}
                    >
                      <Trash2 data-icon="inline-start" />
                      {labels.deleteReply}
                    </Button>
                  ) : null}
                </div>
                <Markdown className="mt-3">{reply.body}</Markdown>
                <div className="mt-3">
                  <ReactionRow
                    currentUserId={currentUserId}
                    reactions={reply.reactions}
                    options={reactionOptions}
                    busy={busy}
                    onReact={(emoji) => onReplyReact(reply, emoji)}
                    addReactionLabel={labels.addReaction}
                    byLabel={labels.reactionsBy}
                    byYouLabel={labels.byYou}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog
        open={deleteReply !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteReply(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteReply}</DialogTitle>
            <DialogDescription>{deleteReply?.body ?? ''}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteReply(null)}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleteReply) {
                  onDeleteReply(deleteReply);
                  setDeleteReply(null);
                }
              }}
            >
              {labels.deleteReply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
