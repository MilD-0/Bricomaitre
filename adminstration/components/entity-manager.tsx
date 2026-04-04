'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { entityFormSchema, type EntityFormValues } from '../lib/permissions';
import { useLiveUpdates } from '../lib/live';
import { type EntityType, type ManagedEntity } from '../lib/entity-types';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ImageUploadField } from './image-upload-field';
import { NativeSelect, NativeSelectOption } from './ui/native-select';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function EntityManager({
  entityType,
  title,
  description,
  imageUploadUrl,
  sectionId,
}: {
  entityType: EntityType;
  title: string;
  description: string;
  imageUploadUrl?: string;
  sectionId?: string;
}) {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useLiveUpdates(entityType);

  const query = useQuery({
    queryKey: ['entities', entityType],
    queryFn: () => request<{ items: ManagedEntity[]; writable: boolean }>(`/api/entities/${entityType}`),
    initialData: { items: [], writable: false },
  });

  const createMutation = useMutation({
    mutationFn: (values: EntityFormValues) => request(`/api/entities/${entityType}`, {
      method: 'POST',
      body: JSON.stringify(values),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityType] });
      setEditingId(null);
      reset();
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EntityFormValues }) =>
      request(`/api/entities/${entityType}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityType] });
      setEditingId(null);
      reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ManagedEntity['status'] }) => request(`/api/entities/${entityType}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entities', entityType] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request(`/api/entities/${entityType}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entities', entityType] }),
  });

  const { register, handleSubmit, reset, formState, watch, setValue } = useForm<EntityFormValues>({
    resolver: zodResolver(entityFormSchema),
    defaultValues: { name: '', status: 'active', tags: '', imageUrl: '' },
  });

  const watchedImageUrl = watch('imageUrl');

  const filtered = useMemo(
    () => query.data.items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [query.data.items, search],
  );

  const writable = query.data.writable;

  const startEdit = (item: ManagedEntity) => {
    setEditingId(item.id);
    reset({
      name: item.name,
      status: item.status,
      tags: item.tags.join(', '),
      imageUrl: item.image ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    reset({ name: '', status: 'active', tags: '', imageUrl: '' });
  };

  return (
    <Card id={sectionId}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <Input placeholder={t('labels.search')} className="max-w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <form
        className="mb-4 grid gap-2 md:grid-cols-4"
        onSubmit={handleSubmit((values) => {
          if (!writable) return;
          if (editingId) {
            editMutation.mutate({ id: editingId, values });
          } else {
            createMutation.mutate(values, { onSuccess: () => reset() });
          }
        })}
      >
        {imageUploadUrl && (
          <div className="md:col-span-4">
            <ImageUploadField
              uploadUrl={imageUploadUrl}
              label={t('labels.image')}
              value={watchedImageUrl ? [watchedImageUrl] : []}
              onChange={(urls) => setValue('imageUrl', urls[0] ?? '', { shouldValidate: true })}
            />
          </div>
        )}
        <Input {...register('name')} placeholder={t('labels.name')} />
        <NativeSelect {...register('status')}>
          <NativeSelectOption value="active">{t('status.active')}</NativeSelectOption>
          <NativeSelectOption value="draft">{t('status.draft')}</NativeSelectOption>
          <NativeSelectOption value="archived">{t('status.archived')}</NativeSelectOption>
        </NativeSelect>
        <Input {...register('tags')} placeholder={t('labels.tags')} />
        <div className="flex gap-2">
          <Button disabled={!writable || formState.isSubmitting} type="submit">
            {editingId ? t('actions.update') : t('actions.create')}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              {t('actions.cancel')}
            </Button>
          )}
        </div>
      </form>

      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((item) => (
          <Card key={item.id} className={editingId === item.id ? 'ring-2 ring-primary' : ''}>
            {item.image && (
              <img src={item.image} alt={item.name} className="mb-2 size-16 rounded object-cover" />
            )}
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">{item.name}</p>
              <Badge>{t(`status.${item.status}`)}</Badge>
            </div>
            <p className="mb-2 text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()}</p>
            <div className="mb-3 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <Badge key={tag}>#{tag}</Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!writable}
                onClick={() => updateMutation.mutate({ id: item.id, status: item.status === 'active' ? 'draft' : 'active' })}
              >
                {t('actions.toggle')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!writable || editingId === item.id}
                onClick={() => startEdit(item)}
              >
                {t('actions.edit')}
              </Button>
              <Button variant="destructive" size="sm" disabled={!writable} onClick={() => deleteMutation.mutate(item.id)}>
                {t('actions.delete')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}
