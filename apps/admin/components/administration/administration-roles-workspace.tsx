'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  permissionCatalog,
  roleDefinitionFormSchema,
  type PermissionKey,
  type RoleDefinitionFormValues,
} from '../../lib/permissions';
import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { SidePanel } from '../ui/side-panel';

type RoleDefinitionItem = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  permissions: PermissionKey[];
};

type RoleDefinitionsResponse = {
  items: RoleDefinitionItem[];
  availablePermissions: PermissionKey[];
};

const defaults: RoleDefinitionFormValues = {
  name: '',
  description: '',
  permissions: ['products_write'],
};

const permissionGroups: Array<{ label: 'commerce' | 'operations'; keys: PermissionKey[] }> = [
  {
    label: 'commerce',
    keys: ['products_write', 'orders_write', 'assets_write', 'brands_categories_write'],
  },
  {
    label: 'operations',
    keys: ['bulletin_moderate', 'ops_view', 'analytics_manage', 'settings_manage'],
  },
];

export function AdministrationRolesWorkspace() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  useAdminAiSurfaceDetails({
    selection:
      typeof selectedId === 'number'
        ? { entityType: 'roleDefinition', ids: [selectedId], focusedId: selectedId }
        : null,
  });

  const query = useQuery({
    queryKey: ['settings', 'roles'],
    queryFn: () => request<RoleDefinitionsResponse>('/api/settings/roles'),
    initialData: { items: [], availablePermissions: [...permissionCatalog] },
  });
  const form = useForm<RoleDefinitionFormValues>({
    resolver: zodResolver(roleDefinitionFormSchema),
    defaultValues: defaults,
  });

  function beginCreate() {
    form.reset(defaults);
    setSelectedId('new');
  }

  function beginEdit(role: RoleDefinitionItem) {
    form.reset({
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions,
    });
    setSelectedId(role.id);
  }

  const saveMutation = useMutation({
    mutationFn: (values: RoleDefinitionFormValues) =>
      request(selectedId === 'new' ? '/api/settings/roles' : `/api/settings/roles/${selectedId}`, {
        method: selectedId === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(values),
      }),
    onMutate: (values) => ({
      toastId: toast.loading(
        t(
          `settings.rolesManager.notifications.${selectedId === 'new' ? 'create' : 'update'}.loading`,
          { name: values.name },
        ),
      ),
    }),
    onSuccess: async (_data, values, context) => {
      toast.success(
        t(
          `settings.rolesManager.notifications.${selectedId === 'new' ? 'create' : 'update'}.success`,
          { name: values.name },
        ),
        { id: context?.toastId },
      );
      await queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'access-grants'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      setSelectedId(null);
    },
    onError: (error: Error, values, context) => {
      toast.error(
        error.message ||
          t('settings.rolesManager.notifications.update.error', { name: values.name }),
        { id: context?.toastId },
      );
    },
  });

  const editor = (
    <form
      className="space-y-5 p-4 sm:p-6"
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>{t('settings.rolesManager.nameLabel')}</span>
        <Input
          {...form.register('name')}
          placeholder={t('settings.rolesManager.namePlaceholder')}
        />
        {form.formState.errors.name ? (
          <span className="text-xs text-destructive">{form.formState.errors.name.message}</span>
        ) : null}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{t('settings.rolesManager.descriptionLabel')}</span>
        <Input
          {...form.register('description')}
          placeholder={t('settings.rolesManager.descriptionPlaceholder')}
        />
      </label>
      <div className="space-y-5 border-t border-border/60 pt-5">
        {permissionGroups.map((group) => {
          const keys = group.keys.filter((key) => query.data.availablePermissions.includes(key));
          if (keys.length === 0) return null;
          return (
            <fieldset key={group.label} className="space-y-2">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[var(--type-tracking-p150)] text-muted-foreground">
                {t(`settings.permissionGroups.${group.label}`)}
              </legend>
              <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
                {keys.map((permission) => (
                  <label
                    key={permission}
                    className="flex min-h-10 items-center gap-3 border-b border-border/40 py-2 text-sm"
                  >
                    <Checkbox value={permission} {...form.register('permissions')} />
                    <span>{t(`settings.permissionLabels.${permission}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        {form.formState.errors.permissions ? (
          <p className="text-xs text-destructive">{form.formState.errors.permissions.message}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={saveMutation.isPending}>
        {selectedId === 'new'
          ? t('settings.rolesManager.createAction')
          : t('settings.rolesManager.updateAction')}
      </Button>
    </form>
  );

  const list = (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {query.data.items.map((role) => (
        <button
          key={role.id}
          type="button"
          className={`w-full px-4 py-4 text-start transition-colors hover:bg-muted/35 ${selectedId === role.id ? 'bg-primary/6' : ''}`}
          onClick={() => beginEdit(role)}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{role.name}</span>
            <Badge variant="outline" className="rounded-full">
              {role.slug}
            </Badge>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {role.description ?? t('settings.rolesManager.noDescription')}
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            {t('settings.rolesManager.permissionCount', { count: role.permissions.length })}
          </span>
        </button>
      ))}
      {!query.isFetching && query.data.items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {t('settings.rolesManager.empty')}
        </div>
      ) : null}
    </div>
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <Shield className="size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">{t('settings.rolesManager.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.rolesManager.existingCount', { count: query.data.items.length })}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={beginCreate}>
          <Plus className="size-4" />
          {t('settings.rolesManager.createAction')}
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
            ? t('settings.rolesManager.createAction')
            : t('settings.rolesManager.updateAction')
        }
        description={t('settings.rolesManager.description')}
        closeLabel={t('actions.close')}
        className="sm:max-w-[42rem]"
      >
        {editor}
      </SidePanel>
    </section>
  );
}
