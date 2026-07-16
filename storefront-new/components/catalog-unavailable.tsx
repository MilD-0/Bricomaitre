import { getTranslations } from 'next-intl/server';

import { PageShell } from '@/components/page-shell';
import type { Locale } from '@/i18n/config';

export async function CatalogUnavailable({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'Products' });
  return (
    <PageShell locale={locale}>
      <section className="catalog-state" role="status">
        <span aria-hidden="true">!</span>
        <h1>{t('unavailableTitle')}</h1>
        <p>{t('unavailableDescription')}</p>
      </section>
    </PageShell>
  );
}
