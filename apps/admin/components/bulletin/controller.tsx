'use client';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent } from 'react';
import { bulletinAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { requestJson as request } from '../../lib/admin-api';
import {
  bulletinPostSchema,
  formatBulletinTags,
  parseBulletinTags,
  type BulletinComposerFormValues,
  type BulletinPostRecord,
} from '../../lib/bulletin';
import { toast } from '../../lib/toast';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { BulletinPostCard } from './post';
import {
  defaultValues,
  reactionOptions,
  readDraft,
  takeOptimisticId,
  toggleReaction,
  updateBulletinBoard,
  type BulletinResponse,
  type PostReactionVariables,
  type ReplyCreateVariables,
  type ReplyDeleteVariables,
  type ReplyReactionVariables,
} from './state';
import { useBulletinComposer } from './use-bulletin-composer';

export function useBulletinBoard() {
  const {
    t,
    cancelComposer,
    refreshBoard,
    setDeletePost,
    queryClient,
    boardQueryKey,
    currentUserId,
    currentUserName,
    setEditingPost,
    setComposerOpen,
    form,
    boardQuery,
    activeTag,
    sort,
    composerOpen,
    editingPost,
    deletePost,
    attachmentsUploadingRef,
    createMutation,
    labelsT,
    setActiveTag,
    setPage,
    setSort,
    setAttachmentsUploading,
    draftValues,
    attachmentsUploading,
  } = useBulletinComposer();

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: BulletinComposerFormValues }) =>
      request(`/api/bulletin/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: values.title,
          body: values.body,
          pinned: values.pinned,
          attachments: values.attachments,
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
      cancelComposer();
      await refreshBoard();
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
      setDeletePost(null);
      await refreshBoard();
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
      const snapshot = queryClient.getQueryData<BulletinResponse>(boardQueryKey);

      updateBulletinBoard(queryClient, boardQueryKey, (current) => ({
        ...current,
        posts: current.posts.map((post) => {
          if (post.id !== postId) {
            return post;
          }

          return {
            ...post,
            reactions: toggleReaction(post.reactions, emoji, {
              id: currentUserId,
              name: currentUserName,
              email: '',
            }),
          };
        }),
      }));

      return { snapshot, queryKey: boardQueryKey, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(context.queryKey, context.snapshot);
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
      const snapshot = queryClient.getQueryData<BulletinResponse>(boardQueryKey);
      const now = new Date().toISOString();

      updateBulletinBoard(queryClient, boardQueryKey, (current) => ({
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

      return { snapshot, queryKey: boardQueryKey, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(context.queryKey, context.snapshot);
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
    onMutate: ({ messages }) => ({ toastId: toast.loading(messages.loading) }),
    onError: (_error, variables, context) => {
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
      const snapshot = queryClient.getQueryData<BulletinResponse>(boardQueryKey);

      updateBulletinBoard(queryClient, boardQueryKey, (current) => ({
        ...current,
        posts: current.posts.map((post) => ({
          ...post,
          replies: post.replies.map((reply) => {
            if (reply.id !== replyId) {
              return reply;
            }

            return {
              ...reply,
              reactions: toggleReaction(reply.reactions, emoji, {
                id: currentUserId,
                name: currentUserName,
                email: '',
              }),
            };
          }),
        })),
      }));

      return { snapshot, queryKey: boardQueryKey, toastId: toast.loading(messages.loading) };
    },
    onError: (_error, variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(context.queryKey, context.snapshot);
      }
      toast.error(variables.messages.error, { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(variables.messages.success, { id: context?.toastId });
      await refreshBoard();
    },
  });

  function openComposer() {
    setEditingPost(null);
    setComposerOpen(true);
    form.reset(readDraft() ?? defaultValues);
  }

  const pagePosts = boardQuery.data.posts;
  const totalPages = boardQuery.data.pagination.totalPages;
  const currentPage = boardQuery.data.pagination.page;
  const pinnedPosts = pagePosts.filter((post) => post.pinned);
  const recentPosts = pagePosts.filter((post) => !post.pinned);
  useAdminAiSurfaceDetails(
    bulletinAiSurfaceDetails({
      activeTag,
      sort,
      page: currentPage,
      visibleCount: pagePosts.length,
      totalPosts: boardQuery.data.pagination.totalItems,
      composerOpen,
      focusedPostId: editingPost?.id ?? deletePost?.id ?? null,
      fetching: boardQuery.isFetching,
    }),
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (attachmentsUploadingRef.current) {
      event.preventDefault();
      return;
    }
    return form.handleSubmit((values) => {
      if (attachmentsUploadingRef.current) return;
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
        updateMutation.mutate({ id: editingPost.id, values });
        return;
      }

      createMutation.mutate(values);
    })(event);
  };

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

  const renderPost = (post: BulletinPostRecord) => (
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
        replyCreateMutation.mutateAsync({
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
  );

  return {
    view: {
      t,
      boardQuery,
      refreshBoard,
      composerOpen,
      editingPost,
      cancelComposer,
      openComposer,
      allTags,
      activeTag,
      setActiveTag,
      setPage,
      sort,
      setSort,
      onSubmit,
      form,
      createMutation,
      updateMutation,
      attachmentsUploadingRef,
      setAttachmentsUploading,
      draftValues,
      busy,
      attachmentsUploading,
      pinnedPosts,
      renderPost,
      pagePosts,
      recentPosts,
      currentPage,
      totalPages,
      deletePost,
      setDeletePost,
      deleteMutation,
    } as const,
    fallback: null,
  };
}
