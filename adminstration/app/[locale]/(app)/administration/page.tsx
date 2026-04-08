import { getTranslations } from 'next-intl/server';

import { ActionHistoryPanel } from '../../../../components/action-history-panel';
import { RoleManagementPanel } from '../../../../components/settings/role-management-panel';
import { UserAccessPanel } from '../../../../components/settings/user-access-panel';
import { requireAdministrationPageAccess } from '../../../../lib/page-access';
import { canManageSettings } from '../../../../lib/permissions';

export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations();
  const { locale } = await params;
  const session = await requireAdministrationPageAccess(locale);
  const permissions = session?.user?.permissions ?? [];
  const canAccessSettings = canManageSettings(permissions);

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-linear-to-br from-background via-background to-muted/40 shadow-sm">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {t('nav.administration')}
              </h1>
            </div>
          </div>
        </div>
      </section>

      {canAccessSettings ? <UserAccessPanel /> : null}
      {canAccessSettings ? <RoleManagementPanel /> : null}
      <ActionHistoryPanel />
    </div>
  );
}
