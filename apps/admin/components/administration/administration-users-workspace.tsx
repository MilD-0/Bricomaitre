'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  userAccessGrantFormSchema,
  type BuiltInRole,
  type UserAccessGrantFormValues,
} from '../../lib/permissions';
import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';

type AccessGrantItem = {
  id: number;
  email: string;
  role: BuiltInRole;
  roleDefinitionId: number | null;
  roleLabel: string | null;
  updatedAt: string;
};

type AccessGrantResponse = {
  items: AccessGrantItem[];
  availableBuiltInRoles: Array<'viewer' | 'employee'>;
  availableCustomRoles: Array<{ id: number; name: string }>;
};

const emptyValues: UserAccessGrantFormValues = {
  email: '',
  role: 'viewer',
  roleDefinitionId: null,
};

function assignmentFor(item: Pick<AccessGrantItem, 'role' | 'roleDefinitionId'>) {
  return item.roleDefinitionId ? `custom:${item.roleDefinitionId}` : `built-in:${item.role}`;
}

export function AdministrationUsersWorkspace() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [assignment, setAssignment] = useState('built-in:viewer');

  const query = useQuery({
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
    defaultValues: emptyValues,
  });

  function beginCreate() {
    form.reset(emptyValues);
    setAssignment('built-in:viewer');
    setSelectedId('new');
  }

  function beginEdit(item: AccessGrantItem) {
    const values: UserAccessGrantFormValues = {
      email: item.email,
      role: item.roleDefinitionId ? null : (item.role as 'viewer' | 'employee'),
      roleDefinitionId: item.roleDefinitionId,
    };
    form.reset(values);
    setAssignment(assignmentFor(item));
    setSelectedId(item.id);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['settings', 'access-grants'] });
    await queryClient.invalidateQueries({ queryKey: ['action-history'] });
  }

  const saveMutation = useMutation({
    mutationFn: (values: UserAccessGrantFormValues) =>
      request(
        selectedId === 'new' ? '/api/settings/access' : `/api/settings/access/${selectedId}`,
        {
          method: selectedId === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify(values),
        },
      ),
    onMutate: () => ({
      toastId: toast.loading(t('settings.accessManager.notifications.save.loading')),
    }),
    onSuccess: async (_data, _values, context) => {
      toast.success(t('settings.accessManager.notifications.save.success'), {
        id: context?.toastId,
      });
      await refresh();
      setSelectedId(null);
    },
    onError: (error: Error, _values, context) =>
      toast.error(error.message, { id: context?.toastId }),
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
      await refresh();
      setSelectedId(null);
    },
    onError: (error: Error, _id, context) => toast.error(error.message, { id: context?.toastId }),
  });

  const editor = (
    <form
      className="space-y-5 p-4 sm:p-6"
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>{t('settings.accessManager.emailLabel')}</span>
        <Input
          type="email"
          {...form.register('email')}
          placeholder={t('settings.accessManager.emailPlaceholder')}
        />
        {form.formState.errors.email ? (
          <span className="text-xs text-destructive">{form.formState.errors.email.message}</span>
        ) : null}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{t('settings.accessManager.assignmentLabel')}</span>
        <NativeSelect
          value={assignment}
          onChange={(event) => {
            const value = event.target.value;
            setAssignment(value);
            if (value.startsWith('custom:')) {
              form.setValue('role', null);
              form.setValue('roleDefinitionId', Number(value.slice(7)));
            } else {
              form.setValue('role', value.slice(9) as 'viewer' | 'employee');
              form.setValue('roleDefinitionId', null);
            }
          }}
        >
          <NativeSelectOptGroup label={t('settings.accessManager.builtInGroup')}>
            {query.data.availableBuiltInRoles.map((role) => (
              <NativeSelectOption key={role} value={`built-in:${role}`}>
                {t(`roles.${role}`)}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label={t('settings.accessManager.customGroup')}>
            {query.data.availableCustomRoles.map((role) => (
              <NativeSelectOption key={role.id} value={`custom:${role.id}`}>
                {role.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
      </label>
      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <Button type="submit" disabled={saveMutation.isPending}>
          {selectedId === 'new'
            ? t('settings.accessManager.createAction')
            : t('settings.accessManager.updateAction')}
        </Button>
        {typeof selectedId === 'number' ? (
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm(t('settings.accessManager.deleteConfirmation')))
                deleteMutation.mutate(selectedId);
            }}
          >
            {t('actions.delete')}
          </Button>
        ) : null}
      </div>
    </form>
  );

  const list = (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {query.data.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`grid w-full gap-2 px-4 py-4 text-start transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${selectedId === item.id ? 'bg-primary/6' : ''}`}
          onClick={() => beginEdit(item)}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.email}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {new Date(item.updatedAt).toLocaleString()}
            </span>
          </span>
          <Badge variant="outline" className="w-fit rounded-full">
            {item.roleLabel ?? t(`roles.${item.role}`)}
          </Badge>
        </button>
      ))}
      {!query.isFetching && query.data.items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {t('settings.accessManager.empty')}
        </div>
      ) : null}
    </div>
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <UserRound className="size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">{t('settings.accessManager.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.accessManager.count', { count: query.data.items.length })}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={beginCreate}>
          <Plus className="size-4" />
          {t('settings.accessManager.createAction')}
        </Button>
      </div>
      {list}
      <SidePanel
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={
          selectedId === 'new'
            ? t('settings.accessManager.createAction')
            : t('settings.accessManager.updateAction')
        }
        description={t('settings.accessManager.assignmentHint')}
        closeLabel={t('actions.close')}
        className="sm:max-w-[34rem]"
      >
        {editor}
      </SidePanel>
    </section>
  );
}
