import { getTranslations } from 'next-intl/server';
import { InventoryManager } from '@/components/inventory-manager';
import { requirePageAccess } from '@/lib/page-access';

export default async function InventoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePageAccess(locale, 'inventory');
  const t = await getTranslations();
  return <InventoryManager title={t('nav.inventory')} />;
}
