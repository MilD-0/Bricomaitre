'use client';

import { useTranslations } from 'next-intl';

import { administrationAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { AdminAiAskButton } from '../admin-ai-ask-button';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
} from '../ui/workspace';

export type AdministrationSection = 'users' | 'roles' | 'storefront' | 'history';

const sections: AdministrationSection[] = ['users', 'roles', 'storefront', 'history'];

export function AdministrationShell({
  locale,
  section,
  children,
}: {
  locale: string;
  section: AdministrationSection;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const base = `/${locale}/administration`;
  useAdminAiSurfaceDetails(administrationAiSurfaceDetails(section));
  const label = (key: AdministrationSection) => {
    if (key === 'users') return t('settings.accessManager.title');
    if (key === 'roles') return t('settings.rolesManager.title');
    if (key === 'storefront') return t('storefrontSettings.title');
    return t('history.title');
  };
  const href = (key: AdministrationSection) => (key === 'users' ? base : `${base}/${key}`);

  return (
    <WorkspaceFrame data-admin-workspace="administration">
      <WorkspaceHeader>
        <WorkspaceHeading title={t('nav.administration')} />
        <WorkspaceActions>
          <AdminAiAskButton />
        </WorkspaceActions>
      </WorkspaceHeader>
      <div className="border-b border-border/60 px-3 py-2 sm:hidden">
        <NativeSelect
          aria-label={t('nav.administration')}
          value={section}
          onChange={(event) => {
            window.location.assign(href(event.target.value as AdministrationSection));
          }}
        >
          {sections.map((key) => (
            <NativeSelectOption key={key} value={key}>
              {label(key)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <WorkspaceNavigation className="hidden sm:flex" aria-label={t('nav.administration')}>
        {sections.map((key) => (
          <WorkspaceNavigationLink key={key} href={href(key)} active={section === key}>
            {label(key)}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigation>
      <main>{children}</main>
    </WorkspaceFrame>
  );
}
