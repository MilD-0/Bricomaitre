'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { requestJson as request } from '../../lib/admin-api';
import {
  bulletinComposerFormSchema,
  parseBulletinTags,
  type BulletinComposerFormValues,
  type BulletinPostRecord,
} from '../../lib/bulletin';
import { toast } from '../../lib/toast';
import {
  defaultValues,
  hasDraftContent,
  normalizeAttachments,
  pageSize,
  readDraft,
  takeOptimisticId,
  updateBulletinBoard,
  writeDraft,
  type BulletinResponse,
} from './state';
export function useBulletinComposer() {
  const t = useTranslations('bulletinBoard');
  const labelsT = useTranslations('labels');
  const queryClient = useQueryClient();
  const loadingToastIdRef = useRef<string | null>(null);
  const [editingPost, setEditingPost] = useState<BulletinPostRecord | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const attachmentsUploadingRef = useRef(false);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [sort, setSort] = useState<'updated-desc' | 'updated-asc' | 'created-desc'>('updated-desc');
  const [page, setPage] = useState(1);
  const [deletePost, setDeletePost] = useState<BulletinPostRecord | null>(null);
  const boardQueryKey = ['bulletin-board', page, activeTag, sort] as const;

  const boardQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        tag: activeTag,
        sort,
      });
      return request<BulletinResponse>(`/api/bulletin?${query}`);
    },
    initialData: {
      posts: [],
      availableTags: [],
      currentUserId: null,
      permissions: { canModerate: false, canPost: true },
      pagination: {
        page: 1,
        limit: pageSize,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
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
  function cancelComposer() {
    setEditingPost(null);
    setComposerOpen(false);
    form.reset(defaultValues);
  }

  const createMutation = useMutation({
    mutationFn: (values: BulletinComposerFormValues) =>
      request('/api/bulletin', {
        method: 'POST',
        body: JSON.stringify({
          title: values.title,
          body: values.body,
          pinned: values.pinned,
          attachments: values.attachments,
          tags: parseBulletinTags(values.tagsInput),
        }),
      }),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ['bulletin-board'] });
      const snapshot = queryClient.getQueryData<BulletinResponse>(boardQueryKey);
      const now = new Date().toISOString();
      const tempId = takeOptimisticId();

      updateBulletinBoard(queryClient, boardQueryKey, (current) => ({
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
        queryKey: boardQueryKey,
        values,
        toastId: toast.loading(t('notifications.create.loading', { title: values.title })),
      };
    },
    onError: (_error, _values, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(context.queryKey, context.snapshot);
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
  return {
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
  } as const;
}
