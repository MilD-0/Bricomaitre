import { BulletinBoard } from '@/components/bulletin-board';
import { requireBulletinPageAccess } from '@/lib/page-access';

export default async function BulletinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireBulletinPageAccess(locale);
  return <BulletinBoard />;
}
