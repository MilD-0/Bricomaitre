'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';

import {
  permissionCatalog,
  roleDefinitionFormSchema,
  type PermissionKey,
  type RoleDefinitionFormValues,
} from '../../lib/permissions';
import { toast } from '../../lib/toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '../ui/field';
import { Input } from '../ui/input';

type RoleDefinitionItem = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionKey[];
  createdAt: string;
  updatedAt: string;
};

type RoleDefinitionsResponse = {
  items: RoleDefinitionItem[];
  availablePermissions: PermissionKey[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export function RoleManagementPanel() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);

  const roleQuery = useQuery({
    queryKey: ['settings', 'roles'],
    queryFn: () => request<RoleDefinitionsResponse>('/api/settings/roles'),
    initialData: { items: [], availablePermissions: [...permissionCatalog] },
  });

  const form = useForm<RoleDefinitionFormValues>({
    resolver: zodResolver(roleDefinitionFormSchema),
    defaultValues: { name: '', description: '', permissions: ['products_write'] },
  });

  const createMutation = useMutation({
    mutationFn: (values: RoleDefinitionFormValues) => request('/api/settings/roles', {
      method: 'POST',
      body: JSON.stringify(values),
    }),
    onMutate: (values) => ({ toastId: toast.loading(t('settings.rolesManager.notifications.create.loading', { name: values.name })) }),
    onSuccess: async (_data, values, context) => {
      toast.success(t('settings.rolesManager.notifications.create.success', { name: values.name }), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      form.reset({ name: '', description: '', permissions: ['products_write'] });
      setEditingRoleId(null);
    },
    onError: (error, values, context) => {
      toast.error(error.message || t('settings.rolesManager.notifications.create.error', { name: values.name }), { id: context?.toastId });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: RoleDefinitionFormValues }) => request(`/api/settings/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(values),
    }),
    onMutate: ({ values }) => ({ toastId: toast.loading(t('settings.rolesManager.notifications.update.loading', { name: values.name })) }),
    onSuccess: async (_data, { values }, context) => {
      toast.success(t('settings.rolesManager.notifications.update.success', { name: values.name }), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      form.reset({ name: '', description: '', permissions: ['products_write'] });
      setEditingRoleId(null);
    },
    onError: (error, { values }, context) => {
      toast.error(error.message || t('settings.rolesManager.notifications.update.error', { name: values.name }), { id: context?.toastId });
    },
  });

  const roleCards = useMemo(() => roleQuery.data.items, [roleQuery.data.items]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/90 shadow-sm">
      <div className="border-b border-border/70 bg-linear-to-r from-muted/45 via-background to-background px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.rolesManager.title')}</h2>
          </div>
          <Badge className="rounded-full px-3 py-1">{t('settings.rolesManager.existingCount', { count: String(roleCards.length) })}</Badge>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 sm:py-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form
          className="flex flex-col gap-5 rounded-[1.5rem] border border-border/70 bg-background/80 p-4 sm:p-5"
          onSubmit={form.handleSubmit((values) => {
            if (editingRoleId) {
              updateMutation.mutate({ id: editingRoleId, values });
              return;
            }

            createMutation.mutate(values);
          })}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="role-name">{t('settings.rolesManager.nameLabel')}</FieldLabel>
              <FieldContent>
                <Input id="role-name" {...form.register('name')} placeholder={t('settings.rolesManager.namePlaceholder')} />
                {form.formState.errors.name ? <p className="text-xs text-rose-600">{form.formState.errors.name.message}</p> : null}
              </FieldContent>
            </Field>

          </FieldGroup>

          <FieldSet className="gap-3">
            <FieldLegend>{t('settings.rolesManager.permissionsLabel')}</FieldLegend>
            <FieldGroup className="grid gap-2">
              {roleQuery.data.availablePermissions.map((permission) => (
                <Field
                  key={permission}
                  orientation="horizontal"
                  className="rounded-[1.1rem] border border-border/70 bg-muted/20 px-3 py-3"
                >
                  <Checkbox id={`permission-${permission}`} value={permission} {...form.register('permissions')} />
                  <FieldLabel htmlFor={`permission-${permission}`} className="font-normal text-foreground">
                    {t(`settings.permissionLabels.${permission}`)}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            {form.formState.errors.permissions ? <p className="mt-1 text-xs text-rose-600">{form.formState.errors.permissions.message}</p> : null}
          </FieldSet>

          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {editingRoleId ? t('settings.rolesManager.updateAction') : t('settings.rolesManager.createAction')}
            </Button>
            {editingRoleId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingRoleId(null);
                  form.reset({ name: '', description: '', permissions: ['products_write'] });
                }}
              >
                {t('settings.rolesManager.cancelEditAction')}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/70 bg-muted/25 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-normal break-words">{t('settings.permissions.customRolesTitle')}</p>
            <p className="text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-normal break-words">{t('labels.actions')}</p>
          </div>

          <div>
            {roleCards.map((role, index) => (
              <div
                key={role.id}
                className={`grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] ${index > 0 ? 'border-t border-border/70' : ''}`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{role.name}</h3>
                        <Badge variant="outline" className="rounded-full">{role.slug}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {role.description ?? t('settings.rolesManager.noDescription')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.map((permission) => (
                      <Badge key={`${role.id}-${permission}`} className="rounded-full">
                        {t(`settings.permissionLabels.${permission}`)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-start justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRoleId(role.id);
                      form.reset({
                        name: role.name,
                        description: role.description ?? '',
                        permissions: role.permissions,
                      });
                    }}
                  >
                    {t('settings.rolesManager.editAction')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
