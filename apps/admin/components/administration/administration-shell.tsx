'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { NativeSelect, NativeSelectOption } from '../ui/native-select';

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
  const label = (key: AdministrationSection) => {
    if (key === 'users') return t('settings.accessManager.title');
    if (key === 'roles') return t('settings.rolesManager.title');
    if (key === 'storefront') return t('storefrontSettings.title');
    return t('history.title');
  };
  const href = (key: AdministrationSection) => (key === 'users' ? base : `${base}/${key}`);

  return (
    <div className="-mx-2 overflow-hidden border-y border-border/70 bg-background sm:mx-0 sm:rounded-[1.4rem] sm:border sm:shadow-sm">
      <header className="border-b border-border/60 px-3 pt-2 lg:px-5 lg:pt-5">
        <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">
          {t('nav.administration')}
        </h1>
        <div className="py-2 sm:hidden">
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
        <nav className="hidden gap-5 sm:flex lg:mt-4" aria-label={t('nav.administration')}>
          {sections.map((key) => (
            <Link
              key={key}
              href={href(key)}
              className={`border-b-2 pb-3 text-sm transition-colors ${
                section === key
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label(key)}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
