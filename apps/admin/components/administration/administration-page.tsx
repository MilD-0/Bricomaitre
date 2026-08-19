import { notFound } from 'next/navigation';

import { requireAdministrationPageAccess } from '../../lib/page-access';
import {
  getStorefrontAiModelOptions,
  loadStorefrontSettings,
  normalizeStorefrontAiModels,
} from '../../lib/storefront-settings';
import { loadStorefrontContentAdmin } from '../../lib/storefront-content';
import { ActionHistoryPanel } from '../action-history-panel';
import { AdministrationRolesWorkspace } from './administration-roles-workspace';
import { AdministrationShell, type AdministrationSection } from './administration-shell';
import { AdministrationStorefrontWorkspace } from './administration-storefront-workspace';
import { AdministrationUsersWorkspace } from './administration-users-workspace';

const sections: AdministrationSection[] = ['users', 'roles', 'storefront', 'history'];

export async function AdministrationPage({
  locale,
  section = 'users',
}: {
  locale: string;
  section?: string;
}) {
  if (!sections.includes(section as AdministrationSection)) notFound();
  await requireAdministrationPageAccess(locale);
  const currentSection = section as AdministrationSection;

  let content: React.ReactNode;
  if (currentSection === 'users') content = <AdministrationUsersWorkspace />;
  else if (currentSection === 'roles') content = <AdministrationRolesWorkspace />;
  else if (currentSection === 'history')
    content = <ActionHistoryPanel className="rounded-none border-0 shadow-none" />;
  else {
    const [loadedSettings, storefrontContent] = await Promise.all([
      loadStorefrontSettings(),
      loadStorefrontContentAdmin(),
    ]);
    const modelOptions = getStorefrontAiModelOptions();
    content = (
      <AdministrationStorefrontWorkspace
        settings={normalizeStorefrontAiModels(loadedSettings, modelOptions)}
        modelOptions={modelOptions}
        content={storefrontContent}
      />
    );
  }

  return (
    <AdministrationShell locale={locale} section={currentSection}>
      {content}
    </AdministrationShell>
  );
}
