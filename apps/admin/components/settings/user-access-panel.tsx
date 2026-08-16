'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  userAccessGrantFormSchema,
  type BuiltInRole,
  type UserAccessGrantFormValues,
} from '../../lib/permissions';
import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from '../ui/native-select';

type AccessGrantItem = {
  id: number;
  email: string;
  role: BuiltInRole;
  roleDefinitionId: number | null;
  roleLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccessGrantResponse = {
  items: AccessGrantItem[];
  availableBuiltInRoles: Array<'viewer' | 'employee'>;
  availableCustomRoles: Array<{ id: number; name: string }>;
};

function getAssignmentValue(values: Pick<UserAccessGrantFormValues, 'role' | 'roleDefinitionId'>) {
  if (typeof values.roleDefinitionId === 'number') {
    return `custom:${values.roleDefinitionId}`;
  }

  if (values.role) {
    return `built-in:${values.role}`;
  }

  return '';
}

export function UserAccessPanel() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [editingGrantId, setEditingGrantId] = useState<number | null>(null);
  const [assignmentValue, setAssignmentValue] = useState('');

  const accessQuery = useQuery({
    queryKey: ['settings', 'access-grants'],
    queryFn: () => request<AccessGrantResponse>('/api/settings/access'),
    initialData: {
      items: [],
      availableBuiltInRoles: ['viewer', 'employee'],
      availableCustomRoles: [],
    },
  });

  const form = useForm<UserAccessGrantFormValues>({
    resolver: zodResolver(userAccessGrantFormSchema),
    defaultValues: {
      email: '',
      role: 'viewer',
      roleDefinitionId: null,
    },
  });

  const invalidateAccess = () =>
    queryClient.invalidateQueries({ queryKey: ['settings', 'access-grants'] });

  const createMutation = useMutation({
    mutationFn: (values: UserAccessGrantFormValues) =>
      request('/api/settings/access', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onMutate: () => ({
      toastId: toast.loading(t('settings.accessManager.notifications.save.loading')),
    }),
    onSuccess: async (_data, _values, context) => {
      toast.success(t('settings.accessManager.notifications.save.success'), {
        id: context?.toastId,
      });
      await invalidateAccess();
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      form.reset({ email: '', role: 'viewer', roleDefinitionId: null });
      setAssignmentValue('built-in:viewer');
    },
    onError: (error, _values, context) => {
      toast.error(error.message, { id: context?.toastId });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: UserAccessGrantFormValues }) =>
      request(`/api/settings/access/${id}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      }),
    onMutate: () => ({
      toastId: toast.loading(t('settings.accessManager.notifications.save.loading')),
    }),
    onSuccess: async (_data, _values, context) => {
      toast.success(t('settings.accessManager.notifications.save.success'), {
        id: context?.toastId,
      });
      await invalidateAccess();
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      setEditingGrantId(null);
      form.reset({ email: '', role: 'viewer', roleDefinitionId: null });
      setAssignmentValue('built-in:viewer');
    },
    onError: (error, _values, context) => {
      toast.error(error.message, { id: context?.toastId });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => request(`/api/settings/access/${id}`, { method: 'DELETE' }),
    onMutate: () => ({
      toastId: toast.loading(t('settings.accessManager.notifications.delete.loading')),
    }),
    onSuccess: async (_data, _id, context) => {
      toast.success(t('settings.accessManager.notifications.delete.success'), {
        id: context?.toastId,
      });
      await invalidateAccess();
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      if (editingGrantId === _id) {
        setEditingGrantId(null);
        form.reset({ email: '', role: 'viewer', roleDefinitionId: null });
        setAssignmentValue('built-in:viewer');
      }
    },
    onError: (error, _id, context) => {
      toast.error(error.message, { id: context?.toastId });
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/90 shadow-sm">
      <div className="border-b border-border/70 bg-linear-to-r from-muted/45 via-background to-background px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t('settings.accessManager.title')}
            </h2>
          </div>
          <Badge className="rounded-full px-3 py-1">
            {t('settings.accessManager.count', { count: String(accessQuery.data.items.length) })}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 sm:py-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form
          className="flex flex-col gap-5 rounded-[1.5rem] border border-border/70 bg-background/80 p-4 sm:p-5"
          onSubmit={form.handleSubmit((values) => {
            if (editingGrantId) {
              updateMutation.mutate({ id: editingGrantId, values });
              return;
            }

            createMutation.mutate(values);
          })}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="grant-email">
                {t('settings.accessManager.emailLabel')}
              </FieldLabel>
              <FieldContent>
                <Input
                  id="grant-email"
                  type="email"
                  {...form.register('email')}
                  placeholder={t('settings.accessManager.emailPlaceholder')}
                />
                {form.formState.errors.email ? (
                  <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p>
                ) : null}
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="grant-assignment">
                {t('settings.accessManager.assignmentLabel')}
              </FieldLabel>
              <FieldContent>
                <NativeSelect
                  id="grant-assignment"
                  value={assignmentValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setAssignmentValue(nextValue);

                    if (nextValue.startsWith('custom:')) {
                      form.setValue('role', null);
                      form.setValue('roleDefinitionId', Number(nextValue.split(':')[1]));
                      return;
                    }

                    if (nextValue.startsWith('built-in:')) {
                      form.setValue('role', nextValue.split(':')[1] as 'viewer' | 'employee');
                      form.setValue('roleDefinitionId', null);
                      return;
                    }

                    form.setValue('role', null);
                    form.setValue('roleDefinitionId', null);
                  }}
                >
                  <NativeSelectOption value="">
                    {t('settings.accessManager.assignmentPlaceholder')}
                  </NativeSelectOption>
                  <NativeSelectOptGroup label={t('settings.accessManager.builtInGroup')}>
                    {accessQuery.data.availableBuiltInRoles.map((role) => (
                      <NativeSelectOption key={role} value={`built-in:${role}`}>
                        {t(`roles.${role}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                  <NativeSelectOptGroup label={t('settings.accessManager.customGroup')}>
                    {accessQuery.data.availableCustomRoles.map((role) => (
                      <NativeSelectOption key={role.id} value={`custom:${role.id}`}>
                        {role.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                </NativeSelect>
                <FieldDescription>{t('settings.accessManager.assignmentHint')}</FieldDescription>
                {form.formState.errors.role ? (
                  <p className="text-xs text-rose-600">{form.formState.errors.role.message}</p>
                ) : null}
                {form.formState.errors.roleDefinitionId ? (
                  <p className="text-xs text-rose-600">
                    {form.formState.errors.roleDefinitionId.message}
                  </p>
                ) : null}
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {editingGrantId
                ? t('settings.accessManager.updateAction')
                : t('settings.accessManager.createAction')}
            </Button>
            {editingGrantId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingGrantId(null);
                  form.reset({ email: '', role: 'viewer', roleDefinitionId: null });
                  setAssignmentValue('built-in:viewer');
                }}
              >
                {t('settings.accessManager.cancelEditAction')}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-3 border-b border-border/70 bg-muted/25 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-normal break-words">
              {t('settings.accessManager.columns.email')}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-normal break-words">
              {t('settings.accessManager.columns.assignment')}
            </p>
            <p className="text-right text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-normal break-words">
              {t('labels.actions')}
            </p>
          </div>

          <div>
            {accessQuery.data.items.map((item, index) => (
              <div
                key={item.id}
                className={`grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] ${index > 0 ? 'border-t border-border/70' : ''}`}
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-foreground">{item.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center">
                  <Badge variant="outline" className="rounded-full">
                    {item.roleLabel ?? t(`roles.${item.role}`)}
                  </Badge>
                </div>

                <div className="flex items-start gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingGrantId(item.id);
                      const values = {
                        email: item.email,
                        role: item.roleDefinitionId ? null : (item.role as 'viewer' | 'employee'),
                        roleDefinitionId: item.roleDefinitionId,
                      } satisfies UserAccessGrantFormValues;
                      form.reset(values);
                      setAssignmentValue(getAssignmentValue(values));
                    }}
                  >
                    {t('actions.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    {t('actions.delete')}
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
