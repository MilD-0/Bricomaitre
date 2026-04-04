import { Activity, Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { ActionHistoryPanel } from '../../../../components/action-history-panel';
import { RoleManagementPanel } from '../../../../components/settings/role-management-panel';
import { UserAccessPanel } from '../../../../components/settings/user-access-panel';
import { Field, FieldContent, FieldGroup, FieldLabel } from '../../../../components/ui/field';
import { getDb, hasDb } from '../../../../db/client';
import { readEcotrackCatalog } from '../../../../lib/ecotrack';
import { requireAdministrationPageAccess } from '../../../../lib/page-access';
import { canManageSettings, canViewOps, isBuiltInRole } from '../../../../lib/permissions';

function SectionShell({
  children,
  className = '',
  description,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/90 shadow-sm ${className}`}>
      <div className="border-b border-border/70 bg-linear-to-r from-muted/50 via-background to-background px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations();
  const { locale } = await params;
  const session = await requireAdministrationPageAccess(locale);
  const permissions = session?.user?.permissions ?? [];
  const role = session?.user?.role ?? 'viewer';
  const roleLabel = session?.user?.roleLabel ?? null;
  const roleDisplayLabel = isBuiltInRole(role) ? t(`roles.${role}`) : roleLabel ?? role;

  const canAccessSettings = canManageSettings(permissions);
  const canAccessOpsConfig = canViewOps(permissions);
  const ecotrackCatalog = canAccessOpsConfig && hasDb() ? await readEcotrackCatalog(getDb()) : null;
  const latestEcotrackSync = ecotrackCatalog?.lastSync ?? null;
  const ecotrackSyncLabel = latestEcotrackSync?.finishedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latestEcotrackSync.finishedAt))
    : t('settings.ecotrack.neverSynced');
  const summaryItems = [
    {
      icon: Shield,
      label: t('settings.general.currentRoleLabel'),
      value: roleDisplayLabel,
    },
    {
      icon: Activity,
      label: t('settings.ecotrack.statusLabel'),
      value: latestEcotrackSync
        ? t(latestEcotrackSync.status === 'success' ? 'settings.ecotrack.statusSuccess' : 'settings.ecotrack.statusFailed')
        : t('settings.ecotrack.statusUnknown'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-linear-to-br from-background via-background to-muted/40 shadow-sm">
        <div className="grid gap-8 px-5 py-6 sm:px-6 sm:py-7 xl:grid-cols-[minmax(0,1.3fr)_20rem]">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {t('nav.administration')}
              </h1>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[1.5rem] border border-border/70 bg-border/70 sm:grid-cols-2">
              {summaryItems.map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-background/90 px-4 py-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="size-4" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em]">{label}</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-[1.5rem] border border-border/70 bg-card/80 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('settings.general.signedInEmailLabel')}
              </p>
              <p className="mt-3 break-all text-lg font-semibold text-foreground">
                {session?.user?.email ?? t('settings.general.missingEmail')}
              </p>
            </div>
            <div className="mt-6 border-t border-border/70 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('settings.ecotrack.lastFetchLabel')}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{ecotrackSyncLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
        <SectionShell title={t('settings.general.currentRoleLabel')}>
          <FieldGroup className="gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="rounded-[1.35rem] border border-border/70 bg-muted/20 px-4 py-4">
                <FieldLabel>{t('settings.general.currentRoleLabel')}</FieldLabel>
                <FieldContent className="text-base font-semibold text-foreground">{roleDisplayLabel}</FieldContent>
              </Field>
              <Field className="rounded-[1.35rem] border border-border/70 bg-muted/20 px-4 py-4">
                <FieldLabel>{t('settings.general.signedInEmailLabel')}</FieldLabel>
                <FieldContent className="break-all text-base font-semibold text-foreground">
                  {session?.user?.email ?? t('settings.general.missingEmail')}
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
        </SectionShell>

        {canAccessOpsConfig ? (
          <SectionShell title={t('settings.ecotrack.title')}>
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-linear-to-r from-muted/40 via-background to-background">
              <FieldGroup className="gap-0">
                <Field className="border-b border-border/70 px-4 py-4">
                  <FieldLabel>{t('settings.ecotrack.lastFetchLabel')}</FieldLabel>
                  <FieldContent className="text-base font-semibold text-foreground">{ecotrackSyncLabel}</FieldContent>
                </Field>
                <Field className="border-b border-border/70 px-4 py-4">
                  <FieldLabel>{t('settings.ecotrack.statusLabel')}</FieldLabel>
                  <FieldContent className="text-base font-semibold text-foreground">
                    {latestEcotrackSync
                      ? t(latestEcotrackSync.status === 'success' ? 'settings.ecotrack.statusSuccess' : 'settings.ecotrack.statusFailed')
                      : t('settings.ecotrack.statusUnknown')}
                  </FieldContent>
                </Field>
                {latestEcotrackSync?.status === 'failed' && latestEcotrackSync.errorMessage ? (
                  <Field className="px-4 py-4">
                    <FieldLabel>{t('settings.ecotrack.errorLabel')}</FieldLabel>
                    <FieldContent>{latestEcotrackSync.errorMessage}</FieldContent>
                  </Field>
                ) : null}
              </FieldGroup>
            </div>
          </SectionShell>
        ) : null}
      </div>

      {canAccessSettings ? <UserAccessPanel /> : null}
      {canAccessSettings ? <RoleManagementPanel /> : null}
      <ActionHistoryPanel />
    </div>
  );
}
